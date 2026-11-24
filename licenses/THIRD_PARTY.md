# Third-party licences

Browser dependencies and their license texts are vendored in
`public/vendor/licenses/`. Self-hosted fonts keep their OFL notices in
`public/fonts/`.

The optional build and validation tools in `package-lock.json` are not shipped
to visitors. Their direct dependencies are Ajv (MIT), ajv-formats (MIT) and
jsdom (MIT); transitive packages and exact versions are recorded in the lock
file and their upstream license notices remain with those packages.
