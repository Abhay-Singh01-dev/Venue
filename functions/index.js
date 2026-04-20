"use strict";

const { handlePipelineRunCompleted } = require("./pipeline_consumer");

exports.pipelineRunCompleted = handlePipelineRunCompleted;
