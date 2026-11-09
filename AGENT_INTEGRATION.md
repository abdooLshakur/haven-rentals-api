# Agent API integration

The Agent API provides controlled access for an external agentic AI. It is separate from customer and staff login tokens.

## Base URL

```
https://haven-rentals-api.onrender.com/api/v1/agent
```

Every Agent API request must include:

```
X-Agent-API-Key: hr_ai_your_secret_key
```

## Create an agent key

An authenticated **admin** creates a key through the normal backend API:

```
POST /api/v1/agent/access-keys
Authorization: Bearer <admin-access-token>
Content-Type: application/json

{
  "name": "Haven operations agent",
  "scopes": [
    "properties:read",
    "enquiries:read",
    "enquiries:write",
    "viewings:read",
    "viewings:propose_reschedule",
    "applications:read",
    "maintenance:read",
    "marketing:drafts"
  ]
}
```

Store the returned key in the agent platform's secret manager. It is shown once only. An admin can list or revoke keys at `GET` / `DELETE /api/v1/agent/access-keys`.

## Allowed routes

| Purpose | Method and route | Required scope |
| --- | --- | --- |
| Verify access | `GET /agent/capabilities` | Any valid key |
| Search listings | `GET /agent/properties?location=Idu&max_rent=2000000&min_bedrooms=2&status=available` | `properties:read` |
| Read customer enquiries | `GET /agent/enquiries?status=new&search=Maryam` | `enquiries:read` |
| Update enquiry status | `PATCH /agent/enquiries/:id` body `{ "status": "contacted" }` | `enquiries:write` |
| Read viewings | `GET /agent/viewings?status=requested` | `viewings:read` |
| Propose a viewing time | `POST /agent/viewings/:id/propose-reschedule` | `viewings:propose_reschedule` |
| Read applications | `GET /agent/applications?status=submitted` | `applications:read` |
| Read maintenance requests | `GET /agent/maintenance?status=open` | `maintenance:read` |
| Create a reply/follow-up draft | `POST /agent/drafts` | `marketing:drafts` |

Example reschedule body:

```json
{
  "proposed_scheduled_at": "2026-12-01T10:30:00.000Z",
  "note": "The requested time is occupied. Would this time work instead?"
}
```

Example draft body:

```json
{
  "type": "marketing_follow_up",
  "enquiry_id": "ENQUIRY_ID",
  "subject": "Homes that match your Idu search",
  "message": "Hello Maryam, we found a few available homes matching your requirements..."
}
```

## Safety controls

- Each key has explicit scopes, can expire, and can be revoked immediately.
- Agent calls are stored in `AgentAuditLog` with their action and result.
- The agent cannot approve/reject applications, acknowledge payments, change rental status, create users, or alter access keys.
- Marketing and customer-care messages are drafts only; they are never sent automatically by this API.
- A reschedule is a proposal only. A tenant must accept it.
- Do not send the key to browsers, frontend JavaScript, chat messages, or public repositories.
