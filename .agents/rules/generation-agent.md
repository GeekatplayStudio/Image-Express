# AI Generation Agent Guidelines

This document defines parameters, constraints, and validation standards for AI agents triggering image or 3D generation.

## 1. Parameter Constraints
- **Dimension Sizing**:
  - Standard sizes should target optimized model buckets (e.g., SDXL/Flux 512x512, 768x768, 1024x1024, or exact aspect-ratio matched buckets).
  - Do not pass arbitrary, high-resolution dimensions that lead to server OOMs or poor output quality.
- **Provider Fallbacks**:
  - Prioritize ComfyUI for local high-fidelity workflows.
  - Fallback to Stability AI for general remote generation.
  - Fallback to OpenAI DALL-E 3 if Stability AI keys are unavailable.
  - Use Ollama SVG pathing exclusively for vector generation requests.

## 2. Security & Preflight Controls
- **Credential Storage**: Never write API keys in configuration files or code source. Always pull keys from the user key-vault endpoint (`/api/user/keys`).
- **Connection Preflights**: Always perform connection health checks on target host URLs (`localhost` vs `host.docker.internal` loopback resolution) before uploading input image buffers.
