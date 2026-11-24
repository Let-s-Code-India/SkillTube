A listing is frustrating when its repository has disappeared or become private. SkillTube's catalog job checks the public repositories attached to listings and updates entries when it detects changes. When a repository is renamed, the catalog can follow the new location. When it cannot find or access a repository, repeated failed checks can lead to its listing being removed.

The job is scheduled every six hours. It requires two consecutive failed checks before removing a listing, which helps avoid treating a single temporary GitHub problem as permanent. This means cleanup is not immediate: if a project becomes unavailable just after a run, the next checks still have to happen. The expected delay can be several hours, and temporary service limits may affect it.

Developers keep control of their projects on GitHub. They can update files, documentation, releases and repository settings there. The catalog does not copy the repository into SkillTube. Its role is to keep the directory's records aligned with whether the public source can still be found and to maintain the repository reference when GitHub reports a rename.

Automation cannot understand every reason a repository is unavailable. A maintainer may intentionally archive a project or change access; a request can also fail because of a rate limit or network issue. Requiring consecutive failures reduces the chance of accidental removal, but it does not eliminate false positives. Developers can contact the team if an entry needs review.

For visitors, the check is a maintenance aid, not a safety certificate. A repository that exists can still contain outdated or unsafe code. Check the project's own history, licence, documentation and issue activity. If you are publishing, keep the repository public and maintain the listing details as the project changes.

The practical benefit is a directory that can clean up stale records without asking visitors to discover every broken link themselves. The mechanism is simple and periodic, with the repository remaining the source of truth.

If you maintain a listing, keep the repository public and check that its description still matches the project. A rename should be handled by the catalog, but a temporary API failure may delay an update. If a valid listing disappears or a repository remains unavailable, contact the team with the listing details so the record can be reviewed.
