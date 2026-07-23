# Bɛyɛ Yie Ghana 🩺

A safety-first WhatsApp companion that gives Ghanaian market women and manual
workers grounded, preventive **occupational-therapy** advice — daily tips,
on-demand answers, and a red-flag safety gate that escalates to a real
professional.

Built on the same NestJS + Postgres + Meta WhatsApp Cloud API stack as
`washam-ai`. See the [architecture plan](https://claude.ai/code/artifact/9b43027c-cb3e-4cc2-9454-0f9767d8c8e0)
for the full design.

## The three layers

| Layer | What | WhatsApp mechanism |
|-------|------|--------------------|
| ① Periodic | Daily tip at the worker's chosen time | Utility template (or text in dev) + optional audio |
| ② On-demand | Grounded answers to pain/questions | Free-form service message |
| ③ Human | Escalate red flags to a real OT/clinic/GHS | Free-form handoff + `CALL` callback |

## The safety-first pipeline

Every inbound message flows through `PipelineService`:

```
0. resolve worker (+ transcribe voice, English-biased)
1. RED-FLAG SAFETY GATE   → escalate + STOP   (BEFORE any advice)
2. special replies         (CALL callback, weekly check-in)
3. onboarding quiz         (name → language → category → tip time)
4. grounded on-demand agent
```

The gate (`agent/safety/`) runs **deterministic rules first**, then an **LLM
backstop** for Twi/Pidgin/mixed phrasings. Either firing = escalate, no advice.
This is the core clinical-responsibility decision — see architecture plan §02.

The on-demand agent (`agent/grounded/`) is **grounded, not generative**: it
retrieves from the vetted OT knowledge base (`agent/knowledge/`, distilled from
the OT reference PDFs) and the LLM only phrases a warm reply — it never
diagnoses, names medication, or invents advice, and always closes with the
in-person referral line. With no LLM key it falls back to safe templated text.

## Quick start

```bash
cp .env.example .env          # fill in Postgres + (optional) LLM + Meta keys
createdb beye_yie
npm install
npm run build
npm start                     # boots, auto-creates tables (synchronize)
npm run seed:tips             # load the 9 vetted tips
```

Runs fully **offline/dry-run** with no Meta token (outbound is logged) and no
LLM key (grounded agent uses safe fallbacks + deterministic red-flag rules).

### Verify the clinical logic (no DB/network)

```bash
npx ts-node -r tsconfig-paths/register scripts/verify-logic.ts
```

Exercises the red-flag gate, phrase→tip map, and knowledge retrieval.

### Drive a conversation locally

With the server running, POST Meta-shaped webhook payloads to
`http://localhost:3005/webhook` (see the flow in `scripts/` / the commit that
added end-to-end testing). Inspect impact at:

- `GET /dashboard/summary` — reach, engagement, pain by body part, red flags
- `GET /dashboard/callbacks` — the queue of workers who asked for a callback

## Configuration (`.env`)

| Key | Purpose |
|-----|---------|
| `DATABASE_URL` | Postgres (conversation log, users, event log, pg-boss) |
| `LLM_PROVIDER` / `*_API_KEY` | `OPENAI` \| `OPENROUTER` \| `GOOGLE` for the grounded agent + red-flag backstop |
| `META_WHATSAPP_TOKEN` / `META_PHONE_NUMBER_ID` / `META_APP_SECRET` | Meta Cloud API send and signed webhook verification (omit token → dry-run) |
| `META_WEBHOOK_VERIFY_TOKEN` | Webhook subscription handshake |
| `VOICE_NOTE_TRANSCRIPTION_ENABLED` | Voice-in (**off by default** — Twi ASR is unreliable, plan §06) |
| `OT_HANDOFF_NAME` / `OT_HANDOFF_CONTACT` | The **real** OT/clinic/GHS contact for Layer ③ |
| `AUDIO_BASE_URL` | Public base URL for recorded tip audio (optional) |

### WhatsApp number isolation

Set `META_PHONE_NUMBER_ID` to the **Phone Number ID** for this bot in Meta,
not its visible telephone number. The webhook now rejects messages that Meta
reports as addressed to another business number in the same WhatsApp Business
Account, preventing this deployment from replying in that number's chats.
Outbound recipients are also validated as canonical WhatsApp IDs before a
message is sent. Set `META_APP_SECRET` from Meta App Dashboard as well: live
webhook events must have a valid `X-Hub-Signature-256` signature before their
sender ID is trusted.

For an extra safety check, scheduled tips and check-ins only go to a worker
after that exact WhatsApp ID has sent a verified message to this bot. Existing
records are therefore paused until their owner messages the bot once after this
release.

## What the team still owns (not code)

- ✅ A **real** confirmed OT / clinic / GHS contact for the handoff layer
- ✅ Native-speaker verification of every Twi line (`tips.data.ts` are drafts)
- ✅ OT sign-off on the 9 tips and knowledge base
- ✅ 18 recorded audio files, named per `tips.data.ts`
- ✅ Meta approval of the 9 tips as utility templates (set `tip.templateName`)

## Project layout

```
src/
  whatsapp/       Meta Cloud API: webhook, send, voice transcription
  messaging/      pg-boss queue (durable inbound processing)
  agent/
    safety/       ⭐ red-flag gate (rules + LLM backstop)
    knowledge/    vetted OT knowledge base + phrase→tip map
    onboarding/   numbered-menu quiz state machine
    grounded/     grounded on-demand agent + prompts
    escalation/   Layer ③ human handoff + callback logging
    personalization/  pain history, adaptive tips, streaks
    pipeline.service.ts   orchestrates the flow
  scheduler/      daily tip cron + weekly check-in cron
  dashboard/      GHS impact reporting API
  database/       entities + tips seed
```
