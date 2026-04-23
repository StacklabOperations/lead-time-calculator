# Claude Code Instructions — Stacklab Ops Toolkit

Read DEV_ENVIRONMENT.md before doing anything in this repo.

---

## DEFAULT BEHAVIOUR

At the start of every session, before doing anything else:
1. Run `git pull` to get the latest changes from GitHub
2. Confirm to the user: "Pulled latest from GitHub. Ready to work."

Do not push to GitHub unless the user explicitly asks. When the user 
asks to push, run:
  git add .
  git commit -m "[brief description of what was built or changed]"
  git push origin main

Then confirm: "Pushed to GitHub. Changes will be live on GitHub Pages 
in a minute or two."

---

## DEVSUM

When the user says DEVSUM, generate a structured handoff report 
covering this build session. Format it exactly like this:

"DEVSUM — Build Session Report
[date]

TOOL BUILT: [name and file path]

WHAT IT DOES:
[2-3 sentence plain English description]

GRAPHQL OPERATIONS USED:
- [mutation/query name]: [what it does, key input fields]
- [repeat for each]

ALIGNI DISCOVERIES (corrections or new knowledge):
- [anything that differed from what the brief expected]
- [field names that weren't obvious]
- [quirks, errors, rate limit or sequencing gotchas]

DECISIONS MADE DURING BUILD:
- [anything not in the brief that had to be figured out]

OUTSTANDING ISSUES / W
