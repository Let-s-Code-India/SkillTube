A directory is more useful when a listing points to the person or organisation that maintains its source. SkillTube uses GitHub sign-in and checks that the signed-in account has the required access to the public repository being listed. This is different from accepting an anonymous file upload: the project stays under its repository owner, and visitors can inspect the source directly.

The check uses GitHub account identity and repository permissions rather than trusting a typed claim alone. A listing includes the repository URL privately in the app workflow, while public SkillTube pages avoid exposing that URL and instead provide the Source action inside the signed-in app. This keeps the public page focused on discovery while leaving ownership checks to the publishing flow.

Verification is not a security review. A person can own a repository that contains broken, misleading or harmful code. GitHub ownership only helps answer who controls the repository at the time of the check. Readers still need to review the code, dependencies, licence and behaviour before installing a skill, server, tool or dataset.

The automated catalog job checks listed repositories every six hours and handles missing, private or renamed projects according to its rules. Repeated failed checks can lead to removal, which helps keep stale entries from lingering indefinitely. Automation can still encounter API limits or temporary failures, so a listing should not be treated as a guarantee that every check happened instantly.

Reports add another route for addressing problems. A developer receives an opportunity to respond to many reports, while serious categories can hide a listing during review. The reporter's identity is not shown to the developer. Administrators can review the case and take action through server-checked functions.

Together, account checks, catalog maintenance and reports make the listing relationship more accountable. They are safeguards with defined limits, not a promise that every project is safe. Open the source repository and make your own decision before you use a resource.

The distinction is important for trust. An owner check can confirm that a publisher has repository access, while a review of the project must still consider code behaviour and provenance. SkillTube's visible signals should not collapse those separate questions into one tick or badge. Visitors can use the listing to identify a maintainer and then make a careful, independent assessment.
