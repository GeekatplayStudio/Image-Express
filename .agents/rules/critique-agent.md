# AI Critique Agent Guidelines

This document specifies instructions and format expectations for agents evaluating and criticizing design layers.

## 1. Visual Review Pipeline
- **Inputs**: Receive either the selected layer raster representation or the full canvas capture as a base64 encoded PNG.
- **Model Selection**: Prefer Vision-capable models (e.g., LLaVA or similar supported Ollama vision models).
- **Prompt Structure**:
  - Critique prompts should guide the model to evaluate balance, colors, composition, and text legibility.
  - Request the critique to return structured observations: areas of strength, readability concerns, and specific improvements.

## 2. Formatting Output
- Output from critique agents should be structured as clean, parseable JSON or formatted markdown.
- Avoid loose conversational preambles (e.g., "Sure, here is my review...") to allow the UI to parse and place critique points directly into overlay nodes.
