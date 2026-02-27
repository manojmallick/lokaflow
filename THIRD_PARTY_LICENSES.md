# LokaFlow™ — Third-Party Licenses

This document lists all third-party open-source components used in LokaFlow™
and their respective licenses.

© 2026 LearnHubPlay BV · KvK: 97741825 · Netherlands

---

> **Note:** LokaFlow™ is in pre-release. This file will be updated as
> dependencies are integrated. All components will be evaluated for
> license compatibility with the Business Source License 1.1 before inclusion.

---

## License Compatibility Policy

LokaFlow™ is released under the Business Source License 1.1 (BUSL-1.1).
Third-party components are selected to be compatible with commercial
distribution. The following license types are permitted:

| License Type | Permitted? | Notes |
|-------------|-----------|-------|
| MIT | Yes | No restrictions |
| Apache 2.0 | Yes | Must include NOTICE file if present |
| BSD 2-Clause / 3-Clause | Yes | No restrictions |
| ISC | Yes | No restrictions |
| MPL 2.0 | Yes | File-level copyleft only |
| LGPL 2.1 / 3.0 | Yes (with care) | Dynamic linking required |
| GPL 2.0 / 3.0 | No | Incompatible with commercial licensing |
| AGPL 3.0 | No | Incompatible with commercial licensing |
| CC0 / Public Domain | Yes | No restrictions |

---

## Runtime Dependencies

*No runtime dependencies have been added yet.*

<!-- Template for each dependency:

### [Package Name](https://package-url)

| Field | Value |
|-------|-------|
| Version | x.x.x |
| License | MIT / Apache 2.0 / etc. |
| Repository | https://github.com/... |
| Used for | Brief description of why this is used |

Full license text:

```
[License text here]
```

-->

---

## Development Dependencies

*No development dependencies have been added yet.*

---

## Model Weights & AI Components

LokaFlow™ routes tasks to third-party AI models. These models are not
bundled with LokaFlow™ — they are downloaded and run separately by the
user. Users are responsible for complying with the license terms of any
model they use with LokaFlow™.

Commonly used models and their licenses:

| Model | Provider | License | Notes |
|-------|----------|---------|-------|
| Llama 3.x | Meta AI | [Llama 3 Community License](https://llama.meta.com/llama3/license/) | Free for most commercial use up to 700M MAU |
| Mistral 7B / 8x7B | Mistral AI | Apache 2.0 | Fully open |
| DeepSeek-Coder | DeepSeek | MIT | Fully open |
| Phi-3 | Microsoft | MIT | Fully open |
| Moondream | vikhyatk | Apache 2.0 | Vision model |
| Whisper | OpenAI | MIT | Speech-to-text |

Cloud models accessed via API (not bundled):

| Model | Provider | Terms |
|-------|----------|-------|
| Claude (Sonnet, Opus, Haiku) | Anthropic | [Anthropic Usage Policy](https://www.anthropic.com/legal/usage-policy) |
| GPT-4o / GPT-4 | OpenAI | [OpenAI Terms of Service](https://openai.com/policies/terms-of-use) |

---

## Acknowledgements

LokaFlow™ builds on the open-source AI ecosystem. We are grateful to the
researchers, engineers, and communities who made local LLM inference
possible — particularly the [Ollama](https://ollama.com) project and the
teams behind the open-weight models listed above.

---

*Last updated: February 2026*
*LokaFlow™ · LearnHubPlay BV · [lokaflow.com](https://lokaflow.com)*
