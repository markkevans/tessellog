import { parseCosignerVerifierKey } from "./cosignatures.js";
import { sameKey, type KeyReference } from "./note-format.js";
import { parseVerifierKey, type NoteVerifier } from "./note-keys.js";
import { failure, success, type Result } from "./result.js";

export type QuorumRule =
  | { readonly kind: "none" }
  | { readonly kind: "witness"; readonly key: KeyReference }
  | { readonly kind: "group"; readonly threshold: number; readonly members: readonly QuorumRule[] };

export type PolicyLog = { readonly verifier: NoteVerifier; readonly url: string | undefined };

export type PolicyWitness = {
  readonly name: string;
  readonly verifier: NoteVerifier;
  readonly url: string | undefined;
};

export type Policy = {
  readonly logs: readonly PolicyLog[];
  readonly witnesses: readonly PolicyWitness[];
  readonly quorum: QuorumRule;
};

type ParseState = {
  readonly logs: readonly PolicyLog[];
  readonly witnesses: readonly PolicyWitness[];
  readonly rules: ReadonlyMap<string, QuorumRule>;
  readonly keys: ReadonlySet<string>;
  readonly quorum: QuorumRule | undefined;
};

const RESERVED_NAMES = new Set(["log", "witness", "group", "quorum", "any", "all", "none"]);
const DISALLOWED_CONTROL = /[\x00-\x08\x0b-\x1f\x7f]/;
const DECIMAL = /^[1-9][0-9]*$/;

const keyMaterial = (vkey: string): string => vkey.split("+").slice(2).join("+");

const checkNewName = (state: ParseState, name: string): Result<string> => {
  if (RESERVED_NAMES.has(name)) {
    return failure(`name "${name}" is reserved`);
  }
  return state.rules.has(name) ? failure(`name "${name}" is defined more than once`) : success(name);
};

const parseLog = (state: ParseState, fields: readonly string[]): Result<ParseState> => {
  const [, vkey = "", url, ...extra] = fields;
  if (vkey === "" || extra.length > 0) {
    return failure("log line must be: log <vkey> [<url>]");
  }
  const verifier = parseVerifierKey(vkey);
  if (!verifier.ok) {
    return failure(`log: ${verifier.error}`);
  }
  const key = `log ${keyMaterial(vkey)}`;
  return state.keys.has(key)
    ? failure(`log ${verifier.value.name} is listed more than once`)
    : success({ ...state, logs: [...state.logs, { verifier: verifier.value, url }], keys: new Set([...state.keys, key]) });
};

const parseWitness = (state: ParseState, fields: readonly string[]): Result<ParseState> => {
  const [, name = "", vkey = "", url, ...extra] = fields;
  if (vkey === "" || extra.length > 0) {
    return failure("witness line must be: witness <name> <vkey> [<url>]");
  }
  const named = checkNewName(state, name);
  const verifier = parseCosignerVerifierKey(vkey);
  if (!named.ok) {
    return named;
  }
  if (!verifier.ok) {
    return failure(`witness ${name}: ${verifier.error}`);
  }
  const key = `witness ${keyMaterial(vkey)}`;
  if (state.keys.has(key)) {
    return failure(`witness ${name} duplicates the key of another witness`);
  }
  const { name: keyName, keyId } = verifier.value;
  return success({
    ...state,
    witnesses: [...state.witnesses, { name, verifier: verifier.value, url }],
    rules: new Map([...state.rules, [name, { kind: "witness", key: { name: keyName, keyId } }]]),
    keys: new Set([...state.keys, key]),
  });
};

const thresholdFor = (text: string, memberCount: number): number => {
  if (text === "any") {
    return 1;
  }
  if (text === "all") {
    return memberCount;
  }
  return DECIMAL.test(text) ? Number(text) : 0;
};

const parseGroup = (state: ParseState, fields: readonly string[]): Result<ParseState> => {
  const [, name = "", thresholdText = "", ...memberNames] = fields;
  const named = checkNewName(state, name);
  if (!named.ok) {
    return named;
  }
  if (memberNames.length === 0) {
    return failure(`group ${name} must list at least one member`);
  }
  const threshold = thresholdFor(thresholdText, memberNames.length);
  if (threshold < 1 || threshold > memberNames.length) {
    return failure(`group ${name} threshold must be between 1 and ${memberNames.length}`);
  }
  const repeated = memberNames.find((member, i) => memberNames.indexOf(member) !== i);
  if (repeated !== undefined) {
    return failure(`group ${name} lists "${repeated}" more than once`);
  }
  const undefinedMember = memberNames.find((member) => !state.rules.has(member));
  if (undefinedMember !== undefined) {
    return failure(`group ${name} refers to undefined name "${undefinedMember}"`);
  }
  const members = memberNames
    .map((member) => state.rules.get(member))
    .filter((rule): rule is QuorumRule => rule !== undefined);
  return success({ ...state, rules: new Map([...state.rules, [name, { kind: "group", threshold, members }]]) });
};

const parseQuorum = (state: ParseState, fields: readonly string[]): Result<ParseState> => {
  const [, name = "", ...extra] = fields;
  if (name === "" || extra.length > 0) {
    return failure("quorum line must be: quorum <name>");
  }
  if (state.quorum !== undefined) {
    return failure("policy defines more than one quorum");
  }
  const rule: QuorumRule | undefined = name === "none" ? { kind: "none" } : state.rules.get(name);
  return rule === undefined
    ? failure(`quorum refers to undefined name "${name}"`)
    : success({ ...state, quorum: rule });
};

const PARSERS: Readonly<Record<string, (state: ParseState, fields: readonly string[]) => Result<ParseState>>> = {
  log: parseLog,
  witness: parseWitness,
  group: parseGroup,
  quorum: parseQuorum,
};

const parseLine = (state: ParseState, line: string): Result<ParseState> => {
  const fields = line.trim().split(/[ \t]+/);
  const [keyword = ""] = fields;
  if (keyword === "" || keyword.startsWith("#")) {
    return success(state);
  }
  const parse = PARSERS[keyword];
  return parse === undefined ? failure(`unknown keyword "${keyword}"`) : parse(state, fields);
};

export const parsePolicy = (text: string): Result<Policy> => {
  if (DISALLOWED_CONTROL.test(text)) {
    return failure("policy contains a control character");
  }
  const parsed = text.split("\n").reduce<Result<ParseState>>(
    (state, line) => (state.ok ? parseLine(state.value, line) : state),
    success({ logs: [], witnesses: [], rules: new Map(), keys: new Set(), quorum: undefined }),
  );
  if (!parsed.ok) {
    return parsed;
  }
  const { logs, witnesses, quorum } = parsed.value;
  return quorum === undefined ? failure("policy must define a quorum") : success({ logs, witnesses, quorum });
};

const satisfies = (rule: QuorumRule, cosigners: readonly KeyReference[]): boolean => {
  switch (rule.kind) {
    case "none":
      return true;
    case "witness":
      return cosigners.some((cosigner) => sameKey(cosigner, rule.key));
    case "group":
      return rule.members.filter((member) => satisfies(member, cosigners)).length >= rule.threshold;
  }
};

export const policySatisfied = (policy: Policy, cosigners: readonly KeyReference[]): boolean =>
  satisfies(policy.quorum, cosigners);
