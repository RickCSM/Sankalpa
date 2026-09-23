# Sankalpa Odisha — Announcement Lifecycle Process

## Overview

The Sankalpa Odisha portal manages government announcements through a structured workflow with **10 statuses**, **7 user roles**, and **3 revert paths**. Every status transition is logged, and relevant stakeholders are notified automatically.

---

## Workflow Statuses

| # | Status | Label | Description |
|---|--------|-------|-------------|
| 1 | `draft` | Draft | Created by CMO Nodal but not yet submitted |
| 2 | `pending_cmo_review` | Pending CMO Review | Submitted and awaiting CMO Reviewer approval |
| 3 | `reverted_by_cmo` | Reverted by CMO | CMO Reviewer sent it back for corrections |
| 4 | `published` | Published | Approved by CMO Reviewer and visible to departments |
| 5 | `accepted` | Accepted | Department Nodal Officer has accepted the announcement |
| 6 | `in_progress` | In Progress | Department is actively working on it |
| 7 | `pending_completion_review` | Pending Completion Review | Department Nodal submitted completion; awaiting Dept Reviewer |
| 8 | `reverted_by_dept_reviewer` | Reverted by Dept Reviewer | Sent back to department for rework |
| 9 | `pending_cmo_completion_review` | Pending CMO Completion Review | Dept Reviewer approved; awaiting final CMO sign-off |
| 10 | `completed` | Completed | Fully approved and closed |

---

## Workflow Diagram

```
                          ┌─────────────────────────┐
                          │        DRAFT             │
                          │   (CMO Nodal creates)    │
                          └───────────┬──────────────┘
                                      │ Submit
                                      ▼
                          ┌─────────────────────────┐
                 ┌────────│   PENDING CMO REVIEW     │
                 │        │  (CMO Reviewer reviews)  │
                 │        └───────────┬──────────────┘
                 │                    │ Approve
                 │ Revert             ▼
                 ▼            ┌──────────────┐
    ┌──────────────────┐      │  PUBLISHED   │
    │ REVERTED BY CMO  │      │ (Visible to  │
    │ (Back to creator)│      │  departments)│
    └────────┬─────────┘      └──────┬───────┘
             │                       │ Dept Nodal accepts
             │ Edit & resubmit      ▼
             └──────────►  ┌──────────────┐
                           │   ACCEPTED   │
                           └──────┬───────┘
                                  │ Dept Nodal starts work
                                  ▼
                          ┌──────────────┐
                          │ IN PROGRESS  │
                          └──────┬───────┘
                                 │ Dept Nodal requests completion
                                 ▼
                  ┌─────────────────────────────┐
         ┌───────│  PENDING COMPLETION REVIEW   │
         │       │   (Dept Reviewer reviews)    │
         │       └───────────┬──────────────────┘
         │                   │ Approve
         │ Revert            ▼
         │       ┌──────────────────────────────────┐
         │       │ PENDING CMO COMPLETION REVIEW     │
         │       │    (CMO Reviewer final sign-off)  │
         │       └───────────┬────────────┬──────────┘
         │                   │ Approve    │ Revert
         │                   ▼            │
         │          ┌────────────┐        │
         │          │ COMPLETED  │        │
         │          └────────────┘        │
         │                                │
         ▼                                ▼
    ┌────────────────────────┐
    │ REVERTED BY DEPT       │
    │ REVIEWER               │
    │ (Back to Dept Nodal    │
    │  for rework)           │
    └────────┬───────────────┘
             │ Fix & resubmit
             └──────────► PENDING COMPLETION REVIEW
```

---

## Status Transitions

| From | To | Triggered By | Action |
|------|----|-------------|--------|
| `draft` | `pending_cmo_review` | CMO Nodal Officer | Submit announcement |
| `pending_cmo_review` | `published` | CMO Reviewer | Approve announcement |
| `pending_cmo_review` | `reverted_by_cmo` | CMO Reviewer | Revert with comment |
| `reverted_by_cmo` | `pending_cmo_review` | CMO Nodal Officer | Edit and resubmit |
| `published` | `accepted` | Dept Nodal Officer | Accept announcement |
| `accepted` | `in_progress` | Dept Nodal Officer | Begin work / add sub-components |
| `in_progress` | `pending_completion_review` | Dept Nodal Officer | Request completion review |
| `reverted_by_dept_reviewer` | `pending_completion_review` | Dept Nodal Officer | Fix and resubmit completion |
| `pending_completion_review` | `pending_cmo_completion_review` | Dept Reviewer | Approve completion |
| `pending_completion_review` | `reverted_by_dept_reviewer` | Dept Reviewer | Revert completion |
| `pending_cmo_completion_review` | `completed` | CMO Reviewer | Final approval |
| `pending_cmo_completion_review` | `reverted_by_dept_reviewer` | CMO Reviewer | Revert to department |

---

## Revert Processes (Detailed)

### Revert 1: CMO Reviewer reverts initial submission

**When:** An announcement is in `pending_cmo_review` status.

**Who:** CMO Reviewer

**Steps:**
1. CMO Reviewer opens the announcement detail page
2. Clicks the **"Revert"** button in the review panel
3. A comment text box appears — a reason is **mandatory**
4. Clicks **"Confirm Revert"**

**Result:**
- Status changes to `reverted_by_cmo`
- A comment/log entry is recorded: "Reverted" with the reviewer's comment
- The original creator (CMO Nodal Officer) receives a notification: _"Announcement '[title]' was reverted by CMO Reviewer."_
- The announcement appears in the creator's **"Action Required"** section on their dashboard
- The creator can edit the announcement and resubmit, sending it back to `pending_cmo_review`

---

### Revert 2: Dept Reviewer reverts completion request

**When:** An announcement is in `pending_completion_review` status.

**Who:** Department Reviewer

**Steps:**
1. Department Reviewer opens the announcement detail page
2. Clicks the **"Revert"** button in the completion review panel
3. A comment text box appears — a reason is **mandatory**
4. Clicks **"Confirm Revert"**

**Result:**
- Status changes to `reverted_by_dept_reviewer`
- A comment/log entry is recorded: "Completion Reverted" with the reviewer's comment
- The Department Nodal Officer receives a notification: _"Completion of '[title]' was reverted by Department Reviewer."_
- The announcement appears in the department's **"Needs Rework"** section
- The Department Nodal can address the issues and resubmit for completion review

---

### Revert 3: CMO Reviewer reverts at final completion stage

**When:** An announcement is in `pending_cmo_completion_review` status (already approved by Dept Reviewer).

**Who:** CMO Reviewer

**Steps:**
1. CMO Reviewer opens the announcement detail page
2. Clicks the **"Revert"** button in the CMO completion review panel
3. A comment text box appears — a reason is **mandatory**
4. Clicks **"Confirm Revert"**

**Result:**
- Status changes to `reverted_by_dept_reviewer` (goes back to the department level, not just one step)
- A comment/log entry is recorded: "CMO Completion Reverted" with the reviewer's comment
- The Department Nodal Officer receives a notification: _"CMO Reviewer reverted completion of '[title]'. Please address and resubmit."_
- The announcement appears in the department's **"Needs Rework"** section
- The Department Nodal must fix and resubmit, going through Dept Reviewer again before reaching CMO

---

## Notifications

| Event | Recipient | Type | Message |
|-------|-----------|------|---------|
| CMO Reviewer approves | CMO Nodal (creator) | Success | "Announcement '[title]' has been approved and published." |
| CMO Reviewer reverts | CMO Nodal (creator) | Warning | "Announcement '[title]' was reverted by CMO Reviewer." |
| Dept Reviewer approves completion | Dept Nodal | Success | "Completion of '[title]' approved by Department Reviewer." |
| Dept Reviewer reverts completion | Dept Nodal | Warning | "Completion of '[title]' was reverted by Department Reviewer." |
| CMO Reviewer approves completion | Dept Nodal | Success | "Announcement '[title]' has been marked as completed." |
| CMO Reviewer reverts completion | Dept Nodal | Warning | "CMO Reviewer reverted completion of '[title]'. Please address and resubmit." |

---

## Role Permissions Summary

| Action | Admin | CM | CMO Nodal | CMO Reviewer | Dept Head | Dept Nodal | Dept Reviewer |
|--------|-------|----|-----------|--------------|-----------|------------|---------------|
| Create announcement | Yes | - | Yes | - | - | - | - |
| Edit & resubmit (draft/reverted) | Yes | - | Yes | - | - | Yes (own dept, reverted) | - |
| Submit for CMO review | Yes | - | Yes | - | - | - | - |
| Approve/Revert at CMO review | - | - | - | Yes | - | - | - |
| Accept published announcement | - | - | - | - | - | Yes | - |
| Add sub-components | - | - | - | - | - | Yes | - |
| Request completion review | - | - | - | - | - | Yes | - |
| Approve/Revert completion | - | - | - | - | - | - | Yes |
| Final approve/Revert at CMO | - | - | - | Yes | - | - | - |
| View reports | Yes | Yes | Yes | Yes | - | - | - |
| Manage users | Yes | - | - | - | - | Yes (own dept) | - |
| View activity log | Yes | - | - | - | - | - | - |

---

## Edit & Resubmit

Announcements in `draft`, `reverted_by_cmo`, or `reverted_by_dept_reviewer` status can be edited and resubmitted:

- **Route:** `/announcements/:id/edit`
- **Who can edit:**
  - Draft / Reverted by CMO: The original creator (CMO Nodal Officer who created it)
  - Reverted by Dept Reviewer: The Department Nodal Officer of the assigned department
- **Edit page:** Reuses the Add Announcement form, pre-filled with all existing data (title, date, description, department, district, block, category, tags, occasion, location, attachment)
- **On submit ("Save & Resubmit"):**
  - For `draft` or `reverted_by_cmo`: Status transitions to `pending_cmo_review`, CMO Reviewers are notified
  - For `reverted_by_dept_reviewer`: Status transitions to `pending_completion_review`, Dept Reviewers are notified
  - A workflow comment is logged ("Edited & Resubmitted" or "Resubmitted for Completion Review")
- **Access control:** The edit route performs permission checks and redirects unauthorized users

---

## Announcement Attachments

Announcements can have optional document attachments (PDF, Word, images). These are:
- Attached during creation by the CMO Nodal Officer
- Visible on the announcement detail page to all roles
- Displayed with file type icon, name, size, and View/Download buttons
- Available for the CMO Reviewer to examine during the review process

---

## Dashboard Role Views

Each role sees a tailored dashboard:

- **Admin**: System overview, recent activity feed, quick actions (Manage Users, Create Announcement, View Reports)
- **Chief Minister**: Key highlights, department performance (top/bottom 5), recent completions; no "My Actions" nav; no draft visibility
- **CMO Nodal**: My created announcements, Letters/UOI summary, quick actions
- **CMO Reviewer**: Pending review queue, pending CMO completion reviews, recently reviewed items
- **Dept Head**: Department announcements by status, department team (read-only)
- **Dept Nodal**: My pending actions, my sub-components, quick actions
- **Dept Reviewer**: Pending completion reviews, recently reviewed items

---

## Reports

Reports are accessible to Admin, Chief Minister, CMO Nodal, and CMO Reviewer roles. The reports menu contains 6 flat items:

1. **Summary Report** — Overall announcement statistics
2. **Department Wise** — Breakdown by department
3. **District Wise** — Breakdown by district
4. **Date Wise** — Breakdown by date range
5. **Status Wise** — Breakdown by workflow status
6. **Aging Analysis** — Announcements grouped by age buckets (0-7, 8-15, 16-30, 31-60, 60+ days) with summary cards, department breakdown, and sortable detail table
