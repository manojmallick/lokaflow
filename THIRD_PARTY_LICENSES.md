# LokaFlow™ — Third-Party Licenses

This document lists all third-party open-source components used in LokaFlow™
and their respective licenses.

© 2026 LearnHubPlay BV · KvK: 97741825 · Netherlands

---

## License Compatibility Policy

LokaFlow™ is released under the Business Source License 1.1 (BUSL-1.1).
Third-party components are selected to be compatible with commercial
distribution. The following license types are permitted:

| License Type            | Permitted?      | Notes                                  |
| ----------------------- | --------------- | -------------------------------------- |
| MIT                     | Yes             | No restrictions                        |
| Apache 2.0              | Yes             | Must include NOTICE file if present    |
| BSD 2-Clause / 3-Clause | Yes             | No restrictions                        |
| ISC                     | Yes             | No restrictions                        |
| CC0 / Public Domain     | Yes             | No restrictions                        |
| MPL 2.0                 | Yes             | File-level copyleft only               |
| LGPL 2.1 / 3.0          | Yes (with care) | Dynamic linking required               |
| GPL 2.0 / 3.0           | No              | Incompatible with commercial licensing |
| AGPL 3.0                | No              | Incompatible with commercial licensing |

---

## Runtime Dependencies

### Core Infrastructure

#### [fastify](https://github.com/fastify/fastify)

| Field    | Value                                                          |
| -------- | -------------------------------------------------------------- |
| Version  | ^4.x                                                           |
| License  | MIT                                                            |
| Used for | HTTP server for `@lokaflow/api` REST + OpenAI-compatible proxy |

#### [zod](https://github.com/colinhacks/zod)

| Field    | Value                                    |
| -------- | ---------------------------------------- |
| Version  | ^3.x                                     |
| License  | MIT                                      |
| Used for | YAML config validation with typed schema |

#### [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)

| Field    | Value                                                        |
| -------- | ------------------------------------------------------------ |
| Version  | ^9.x                                                         |
| License  | MIT                                                          |
| Used for | Budget tracker, memory store, audit log (synchronous SQLite) |

#### [commander](https://github.com/tj/commander.js)

| Field    | Value                                              |
| -------- | -------------------------------------------------- |
| Version  | ^12.x                                              |
| License  | MIT                                                |
| Used for | CLI entry point (`lokaflow chat`, `lokaflow cost`) |

#### [chalk](https://github.com/chalk/chalk)

| Field    | Value                                         |
| -------- | --------------------------------------------- |
| Version  | ^5.x                                          |
| License  | MIT                                           |
| Used for | CLI output formatting and cost report display |

#### [js-yaml](https://github.com/nodeca/js-yaml)

| Field    | Value                                      |
| -------- | ------------------------------------------ |
| Version  | ^4.x                                       |
| License  | MIT                                        |
| Used for | Parsing `lokaflow.yaml` configuration file |

#### [compromise](https://github.com/spencermountain/compromise)

| Field    | Value                                             |
| -------- | ------------------------------------------------- |
| Version  | ^14.x                                             |
| License  | MIT                                               |
| Used for | NLP-based named entity recognition in PII scanner |

#### [node-fetch](https://github.com/node-fetch/node-fetch) / native fetch

| Field    | Value                                        |
| -------- | -------------------------------------------- |
| Version  | native (Node 22+)                            |
| License  | MIT                                          |
| Used for | Ollama provider HTTP calls, Brave Search API |

---

### AI Provider SDKs

#### [@anthropic-ai/sdk](https://github.com/anthropic-ai/sdk-python)

| Field    | Value                                                |
| -------- | ---------------------------------------------------- |
| Version  | ^0.x                                                 |
| License  | MIT                                                  |
| Used for | Claude provider (Haiku, Sonnet, Opus) with streaming |

#### [openai](https://github.com/openai/openai-node)

| Field    | Value                                                              |
| -------- | ------------------------------------------------------------------ |
| Version  | ^4.x                                                               |
| License  | Apache 2.0                                                         |
| Used for | OpenAI provider (GPT-4o, GPT-4o-mini) and Groq (OpenAI-compatible) |

#### [@google/generative-ai](https://github.com/google-gemini/generative-ai-js)

| Field    | Value                                        |
| -------- | -------------------------------------------- |
| Version  | ^0.x                                         |
| License  | Apache 2.0                                   |
| Used for | Gemini provider with `generateContentStream` |

#### [groq-sdk](https://github.com/groq/groq-typescript)

| Field    | Value                                      |
| -------- | ------------------------------------------ |
| Version  | ^0.x                                       |
| License  | Apache 2.0                                 |
| Used for | Groq provider (Llama 3.3 70B, DeepSeek R1) |

---

### LokaGuard Dependencies (planned — `@lokaflow/guard`)

#### [pdfkit](https://github.com/foliojs/pdfkit)

| Field    | Value                                   |
| -------- | --------------------------------------- |
| Version  | ^0.15.x (planned)                       |
| License  | MIT                                     |
| Used for | DORA / SOX / GDPR PDF report generation |

#### [pdfkit-table](https://github.com/natancabral/pdfkit-table)

| Field    | Value                              |
| -------- | ---------------------------------- |
| Version  | ^0.1.x (planned)                   |
| License  | MIT                                |
| Used for | Compliance report table formatting |

#### [node-cron](https://github.com/kelektiv/node-cron)

| Field    | Value                                          |
| -------- | ---------------------------------------------- |
| Version  | ^3.x (planned)                                 |
| License  | ISC                                            |
| Used for | Scheduled monthly compliance report generation |

---

### LokaEnterprise Dependencies (planned — `@lokaflow/enterprise`)

#### [@azure/msal-node](https://github.com/AzureAD/microsoft-authentication-library-for-js)

| Field    | Value                                            |
| -------- | ------------------------------------------------ |
| Version  | ^2.x (planned)                                   |
| License  | MIT                                              |
| Used for | Microsoft Entra ID (Azure AD) SSO authentication |

#### [passport-saml](https://github.com/node-saml/passport-saml)

| Field    | Value                                   |
| -------- | --------------------------------------- |
| Version  | ^3.x (planned)                          |
| License  | MIT                                     |
| Used for | SAML 2.0 SSO (Okta, ADFS, PingFederate) |

#### [passport-google-oauth20](https://github.com/jaredhanson/passport-google-oauth2)

| Field    | Value                               |
| -------- | ----------------------------------- |
| Version  | ^2.x (planned)                      |
| License  | MIT                                 |
| Used for | Google Workspace SSO authentication |

#### [pg](https://github.com/brianc/node-postgres)

| Field    | Value                                                 |
| -------- | ----------------------------------------------------- |
| Version  | ^8.x (planned)                                        |
| License  | MIT                                                   |
| Used for | Postgres client for enterprise multi-user deployments |

---

### LokaMesh Dependencies (`@lokaflow/mesh`)

#### [multicast-dns](https://github.com/mafintosh/multicast-dns)

| Field    | Value                                                                      |
| -------- | -------------------------------------------------------------------------- |
| Version  | ^7.x                                                                       |
| License  | MIT                                                                        |
| Used for | mDNS discovery of LokaFlow nodes on local network (\_lokaflow.\_tcp.local) |

---

## Development Dependencies

#### [vitest](https://github.com/vitest-dev/vitest)

| Field    | Value                                             |
| -------- | ------------------------------------------------- |
| Version  | ^2.x                                              |
| License  | MIT                                               |
| Used for | Unit and integration test runner with v8 coverage |

#### [typescript](https://github.com/microsoft/TypeScript)

| Field    | Value                             |
| -------- | --------------------------------- |
| Version  | ^5.5                              |
| License  | Apache 2.0                        |
| Used for | Static typing across all packages |

#### [eslint](https://github.com/eslint/eslint)

| Field    | Value                      |
| -------- | -------------------------- |
| Version  | ^9.x                       |
| License  | MIT                        |
| Used for | Code linting (flat config) |

#### [prettier](https://github.com/prettier/prettier)

| Field    | Value                                           |
| -------- | ----------------------------------------------- |
| Version  | ^3.x                                            |
| License  | MIT                                             |
| Used for | Code formatting (100-char lines, double quotes) |

#### [@typescript-eslint/eslint-plugin](https://github.com/typescript-eslint/typescript-eslint)

| Field    | Value                            |
| -------- | -------------------------------- |
| Version  | ^8.x                             |
| License  | MIT                              |
| Used for | TypeScript-specific ESLint rules |

---

## Model Weights & AI Components

LokaFlow™ routes tasks to third-party AI models. These models are not
bundled with LokaFlow™ — they are downloaded and run separately by the
user via Ollama. Users are responsible for complying with the license
terms of any model they use.

### Recommended Local Models

| Model             | Provider      | License           | Notes                         |
| ----------------- | ------------- | ----------------- | ----------------------------- |
| qwen2.5:7b        | Alibaba Cloud | Apache 2.0        | Best all-round local model    |
| qwen2.5-coder:7b  | Alibaba Cloud | Apache 2.0        | Best local coding model       |
| qwen2.5vl:7b      | Alibaba Cloud | Apache 2.0        | Vision + multimodal           |
| mistral:7b        | Mistral AI    | Apache 2.0        | Strong reasoning, EU provider |
| llama3.2:3b       | Meta AI       | Llama 3 Community | Lightweight, fast             |
| llama3.3:70b      | Meta AI       | Llama 3 Community | High-capability local         |
| deepseek-coder-v2 | DeepSeek      | MIT               | Code generation               |
| nomic-embed-text  | Nomic AI      | Apache 2.0        | Embeddings for RAG            |
| tinyllama:1.1b    | StatNLP       | Apache 2.0        | Minimal hardware requirement  |

### Cloud Models (accessed via API — not bundled)

| Model                        | Provider   | Terms                                                                                      |
| ---------------------------- | ---------- | ------------------------------------------------------------------------------------------ |
| Claude (Haiku, Sonnet, Opus) | Anthropic  | [Anthropic Usage Policy](https://www.anthropic.com/legal/usage-policy)                     |
| GPT-4o / GPT-4o-mini         | OpenAI     | [OpenAI Terms of Service](https://openai.com/policies/terms-of-use)                        |
| Gemini 2.5 Flash / Pro       | Google     | [Google AI Terms](https://ai.google.dev/gemini-api/terms)                                  |
| Llama 3.3-70B (via Groq)     | Groq       | [Groq Terms of Service](https://groq.com/terms-of-service/)                                |
| Grok-3-mini                  | xAI        | [xAI Terms of Service](https://x.ai/legal/terms-of-service)                                |
| DeepSeek Chat                | DeepSeek   | [DeepSeek Terms](https://platform.deepseek.com/downloads/DeepSeek%20Terms%20of%20Use.html) |
| Mistral Small                | Mistral AI | [Mistral Terms](https://mistral.ai/terms/)                                                 |

---

## Acknowledgements

LokaFlow™ builds on the open-source AI ecosystem. We are grateful to:

- The [Ollama](https://ollama.com) project — making local inference accessible
- The Alibaba Cloud Qwen team — for qwen2.5 models (Apache 2.0, commercially usable)
- The Mistral AI team — for open-weight EU-based models
- Meta AI — for the Llama model family
- The [Fastify](https://fastify.dev) team — for the API server
- The [Vitest](https://vitest.dev) team — for the test framework
- All open-source contributors whose MIT/Apache libraries make this possible

---

_Last updated: March 2026_
_LokaFlow™ · LearnHubPlay BV · [lokaflow.com](https://lokaflow.com)_
