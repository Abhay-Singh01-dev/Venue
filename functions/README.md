# Firebase Functions Placeholder

This directory exists to signal the Firebase architecture boundary for future Cloud Functions.
The current deployment uses Cloud Run for the backend API, but the Firebase configuration keeps
the functions source path ready for webhook or event-driven expansion.

## Mock Consumer

- `pipeline_consumer.js` mimics a Pub/Sub-triggered Firebase Function for `pipeline.run.completed`
- `index.js` exports the handler shape expected by Firebase Functions runtimes
- The consumer can be run locally with `node pipeline_consumer.js` to inspect the derived summary payload
