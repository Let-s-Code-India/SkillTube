import Ajv from "ajv";
import addFormats from "ajv-formats";
import { readFile, readdir } from "node:fs/promises";

const ajv = new Ajv({ allErrors: true, strict: true });
addFormats(ajv);
const schemas = await Promise.all([
  JSON.parse(await readFile("schema/skill.schema.json", "utf8")),
  JSON.parse(await readFile("schema/developer.schema.json", "utf8")),
]);
for (const schema of schemas) ajv.addSchema(schema);

let count = 0;
for (const file of await readdir("schema/fixtures")) {
  if (!file.endsWith(".json")) continue;
  const kind = file.replace(".json", "");
  const schema = schemas.find((item) =>
    item.title.toLowerCase().includes(kind),
  );
  if (!schema) throw new Error(`No schema found for fixture ${file}.`);
  const fixture = JSON.parse(await readFile(`schema/fixtures/${file}`, "utf8"));
  const validate = ajv.getSchema(schema.$id);
  if (!validate(fixture))
    throw new Error(
      `${file}: ${ajv.errorsText(validate.errors, { separator: "; " })}`,
    );
  count++;
}
if (count !== 2)
  throw new Error(`Expected two schema fixtures, validated ${count}.`);
console.log(
  `Validated ${count} fixture payloads against ${schemas.length} schemas.`,
);
