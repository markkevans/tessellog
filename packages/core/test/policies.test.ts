import { describe, expect, it } from "vitest";
import { parsePolicy, policySatisfied, type Policy } from "../src/index.js";
import { PETER_VKEY } from "./fixtures/keys.js";
import { keyOf, POLICY_WITNESSES as W, type PolicyWitnessId } from "./fixtures/witnesses.js";

const specExample = [
  `log ${PETER_VKEY} https://log.example/`,
  `witness X1 ${W.x1.vkey} https://x1.example/`,
  `witness X2 ${W.x2.vkey}`,
  `witness X3 ${W.x3.vkey}`,
  "group X-witnesses 2 X1 X2 X3",
  `witness Y1 ${W.y1.vkey}`,
  `witness Y2 ${W.y2.vkey}`,
  `witness Y3 ${W.y3.vkey}`,
  "group Y-witnesses any Y1 Y2 Y3",
  "group X-and-Y all X-witnesses Y-witnesses",
  "quorum X-and-Y",
].join("\n");

const parsed = (text: string): Policy => {
  const result = parsePolicy(text);
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.value;
};

const cosignedBy = (...ids: readonly PolicyWitnessId[]) => ids.map(keyOf);

describe("parsing a tlog-policy file", () => {
  it("reads the logs and witnesses, keeping optional URLs", () => {
    const policy = parsed(specExample);
    expect(policy.logs.map(({ verifier, url }) => ({ name: verifier.name, url }))).toEqual([
      { name: "PeterNeumann", url: "https://log.example/" },
    ]);
    expect(policy.witnesses.map(({ name, url }) => ({ name, url }))).toEqual([
      { name: "X1", url: "https://x1.example/" },
      { name: "X2", url: undefined },
      { name: "X3", url: undefined },
      { name: "Y1", url: undefined },
      { name: "Y2", url: undefined },
      { name: "Y3", url: undefined },
    ]);
  });

  it("ignores blank lines, comment lines and tab separators", () => {
    const policy = parsed(`# a comment\n\n  \t# indented comment\nwitness\tX1\t${W.x1.vkey}\nquorum X1\n`);
    expect(policySatisfied(policy, cosignedBy("x1"))).toBe(true);
  });
});

describe("evaluating a witness quorum", () => {
  it.each<[string, readonly PolicyWitnessId[], boolean]>([
    ["two X witnesses and one Y witness", ["x1", "x2", "y3"], true],
    ["every witness", ["x1", "x2", "x3", "y1", "y2", "y3"], true],
    ["one X witness and two Y witnesses", ["x1", "y1", "y2"], false],
    ["only X witnesses", ["x1", "x2", "x3"], false],
    ["no witnesses", [], false],
  ])("decides the spec example's quorum given %s", (_, ids, satisfied) => {
    expect(policySatisfied(parsed(specExample), cosignedBy(...ids))).toBe(satisfied);
  });

  it("is always satisfied by quorum none", () => {
    expect(policySatisfied(parsed("quorum none"), [])).toBe(true);
  });

  it("requires the named witness when the quorum is a single witness", () => {
    const policy = parsed(`witness X1 ${W.x1.vkey}\nwitness X2 ${W.x2.vkey}\nquorum X1`);
    expect(policySatisfied(policy, cosignedBy("x2"))).toBe(false);
    expect(policySatisfied(policy, cosignedBy("x1"))).toBe(true);
  });

  it("ignores cosignatures from keys outside the policy", () => {
    const policy = parsed(`witness X1 ${W.x1.vkey}\nquorum X1`);
    expect(policySatisfied(policy, [{ name: "x1.example/w", keyId: 0 }])).toBe(false);
  });
});

describe("rejecting invalid policies", () => {
  it.each<[string, string, string]>([
    ["no quorum", `witness X1 ${W.x1.vkey}`, "policy must define a quorum"],
    ["two quorums", `witness X1 ${W.x1.vkey}\nquorum X1\nquorum none`, "policy defines more than one quorum"],
    ["a quorum naming nothing defined", "quorum X1", 'quorum refers to undefined name "X1"'],
    [
      "a group naming a later witness",
      `group G any X1\nwitness X1 ${W.x1.vkey}\nquorum G`,
      'group G refers to undefined name "X1"',
    ],
    [
      "a member listed twice",
      `witness X1 ${W.x1.vkey}\ngroup G any X1 X1\nquorum G`,
      'group G lists "X1" more than once',
    ],
    ["a zero threshold", `witness X1 ${W.x1.vkey}\ngroup G 0 X1\nquorum G`, "group G threshold must be between 1 and 1"],
    [
      "a threshold above the member count",
      `witness X1 ${W.x1.vkey}\ngroup G 2 X1\nquorum G`,
      "group G threshold must be between 1 and 1",
    ],
    ["a non-decimal threshold", `witness X1 ${W.x1.vkey}\ngroup G two X1\nquorum G`, "group G threshold must be between 1 and 1"],
    ["a group with no members", "group G any\nquorum none", "group G must list at least one member"],
    ["an unknown keyword", "mirror M\nquorum none", 'unknown keyword "mirror"'],
    [
      "a name defined twice",
      `witness X1 ${W.x1.vkey}\nwitness X1 ${W.x2.vkey}\nquorum X1`,
      'name "X1" is defined more than once',
    ],
    [
      "the same witness key twice",
      `witness X1 ${W.x1.vkey}\nwitness X9 ${W.x1.vkey}\nquorum X1`,
      "witness X9 duplicates the key of another witness",
    ],
    ["the same log key twice", `log ${PETER_VKEY}\nlog ${PETER_VKEY}\nquorum none`, "log PeterNeumann is listed more than once"],
    ["a witness key that is not a cosignature key", `witness X1 ${PETER_VKEY}\nquorum X1`, "witness X1: PeterNeumann is not an Ed25519 cosignature (0x04) key"],
    ["a log key that is not an Ed25519 key", `log ${W.x1.vkey}\nquorum none`, "log: unsupported key encoding for x1.example/w"],
    ["a reserved name", `witness none ${W.x1.vkey}\nquorum none`, 'name "none" is reserved'],
    ["a control character", `witness X1 ${W.x1.vkey}\r\nquorum X1`, "policy contains a control character"],
    ["a witness line with too many fields", `witness X1 ${W.x1.vkey} https://x/ extra\nquorum X1`, "witness line must be: witness <name> <vkey> [<url>]"],
    ["a log line with no key", "log\nquorum none", "log line must be: log <vkey> [<url>]"],
    ["a quorum line with extra fields", "quorum none extra", "quorum line must be: quorum <name>"],
  ])("rejects %s", (_, text, error) => {
    expect(parsePolicy(text)).toEqual({ ok: false, error });
  });
});
