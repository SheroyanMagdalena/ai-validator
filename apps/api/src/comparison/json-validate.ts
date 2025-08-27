import Ajv from 'ajv';
import addFormats from 'ajv-formats';

export function validateAgainstSchema(apiObj: unknown, modelSchema: unknown) {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(modelSchema as any);
  const ok = validate(apiObj);
  return { ok, errors: validate.errors ?? [] };
}
