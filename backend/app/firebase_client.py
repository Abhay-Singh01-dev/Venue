"""
Firebase Admin SDK singleton initialization and Firestore client.
Handles both local credentials file and base64-encoded credentials
for Cloud Run deployment.
"""

import os
import json
import base64
import logging

import firebase_admin
from firebase_admin import credentials, firestore

from app.core.settings import settings

logger = logging.getLogger(__name__)


class FirebaseClient:
    def __init__(self):
        self.db = None
        
        # Avoid double initialization
        if firebase_admin._apps:
            logger.info("Firebase already initialized, skipping.")
            self.db = firestore.client()
            return

        cred = None
        
        # 1. Try to load from file
        file_path = settings.firebase_credentials_path
        if os.path.exists(file_path):
            try:
                cred = credentials.Certificate(file_path)
                logger.info("Initializing Firebase using credentials file at %s", file_path)
            except Exception:
                # Do not log raw exception to prevent secret leakage
                logger.error("Failed to load credentials from file. The file may be malformed.")
        else:
            logger.warning("Firebase credentials file not found at %s. Proceeding to fallback.", file_path)

        # 2. Try to load from base64 environment variable
        b64_creds = settings.firebase_credentials_base64
        if not cred and b64_creds:
            try:
                creds_json = json.loads(
                    base64.b64decode(b64_creds.strip()).decode("utf-8")
                )
                cred = credentials.Certificate(creds_json)
                logger.info("Initializing Firebase using base64 credentials.")
            except Exception:
                # Do not fail hard here: Cloud Run may rely on ADC instead of explicit secrets.
                logger.error("Invalid base64 Firebase credentials provided in environment variable.")

        # 3. Fall back to Application Default Credentials only on Cloud Run.
        # Local development should not silently use gcloud user ADC because
        # that commonly causes noisy PERMISSION_DENIED loops when Firestore
        # IAM is not configured for the local identity.
        is_cloud_run = bool(os.getenv("K_SERVICE"))
        if not cred:
            if is_cloud_run:
                try:
                    cred = credentials.ApplicationDefault()
                    logger.info("Initializing Firebase using Application Default Credentials.")
                except Exception:
                    logger.error("Application Default Credentials are unavailable.")
            else:
                logger.info(
                    "Skipping ADC fallback outside Cloud Run. "
                    "Set FIREBASE_CREDENTIALS_PATH or FIREBASE_CREDENTIALS_BASE64 for local Firestore access."
                )

        # 4. Fail if neither worked
        if not cred:
            msg = "Could not initialize Firebase via file or base64 environment variable."
            logger.error(msg)
            raise RuntimeError(msg)

        # Initialize explicit project ID binding from settings to ensure safe multi-tenancy
        firebase_admin.initialize_app(cred, {"projectId": settings.firebase_project_id})
        self.db = firestore.client()
        logger.info("Firebase initialized successfully for project ID: %s", settings.firebase_project_id)

    def get_db(self) -> firestore.Client:
        """
        Returns the Firestore client.
        This client provides access to the database for all persistent operations.
        """
        return self.db

    def is_initialized(self) -> bool:
        """Helper to verify database connection."""
        return self.db is not None


# Module-level singleton
try:
    firebase_client = FirebaseClient()
    db = firebase_client.get_db()
except RuntimeError as e:
    logger.warning("Running without Firebase credentials. Db will be None.")
    firebase_client = None
    db = None

