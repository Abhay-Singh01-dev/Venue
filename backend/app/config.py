"""
Alias for backward compatibility with import tests.
Redirects settings imports to app.core.settings.
"""
from app.core.settings import settings

__all__ = ['settings']
