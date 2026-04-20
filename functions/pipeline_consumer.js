"use strict";

function decodePubSubMessage(event) {
  if (!event) {
    return {};
  }

  const message = event.message || event.data || event;
  if (!message) {
    return {};
  }

  if (typeof message === "string") {
    try {
      return JSON.parse(message);
    } catch (error) {
      return { raw_message: message };
    }
  }

  if (message.data) {
    try {
      const decoded = Buffer.from(message.data, "base64").toString("utf8");
      return JSON.parse(decoded);
    } catch (error) {
      return { raw_message: message.data };
    }
  }

  return message;
}

function handlePipelineRunCompleted(event) {
  const payload = decodePubSubMessage(event);
  const summary = {
    event_type: "pipeline.run.completed",
    run_id: payload.run_id || "unknown",
    published_at: payload.published_at || new Date().toISOString(),
    downstream_evidence_pointer: payload.downstream_evidence_pointer || null,
    derived_summary: {
      source: payload.source || "unknown",
      pipeline_health: payload.pipeline_health || "unknown",
      note: "Mock Firebase Function consumer for workflow-depth proof.",
    },
  };

  console.log(JSON.stringify(summary, null, 2));

  return summary;
}

module.exports = {
  decodePubSubMessage,
  handlePipelineRunCompleted,
};

if (require.main === module) {
  const sampleEvent = {
    message: {
      data: Buffer.from(
        JSON.stringify({
          run_id: "sample-run",
          source: "cached",
          pipeline_health: "degraded",
          published_at: new Date().toISOString(),
        }),
      ).toString("base64"),
    },
  };

  handlePipelineRunCompleted(sampleEvent);
}
