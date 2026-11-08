import { parseCosignerVerifierKey, type KeyReference } from "../../src/index.js";

export const POLICY_WITNESSES = {
  x1: {
    skey: "PRIVATE+KEY+x1.example/w+47864d96+AUF2Jv2rlQ6HooKgKJYcoyZGJB+Zv67l/E7syx7tlJ8O",
    vkey: "x1.example/w+404eb6e7+BI7UVG0PQqXiEvOtLy09HbMUsqo7VtvTPnfoEgtBSviu",
  },
  x2: {
    skey: "PRIVATE+KEY+x2.example/w+92937f4c+AXHQODMXZi4pKauKoYQraEzzyRh0Zw/THSow+LMuEBXf",
    vkey: "x2.example/w+90907b95+BLb7bX7QEsuSvDvPRllwc570aI9mWY56PhlvllhA0LDG",
  },
  x3: {
    skey: "PRIVATE+KEY+x3.example/w+a5b587ad+AThUhCXNU1OKsgZLRU30uAjEtcorMHbGRK/zVXyYNkFy",
    vkey: "x3.example/w+09c9d0f0+BMiPS7eFsDXtoagG3Xvt699V7xyYYRi494HvhAwXZrPY",
  },
  y1: {
    skey: "PRIVATE+KEY+y1.example/w+055f1e89+AUs7EsfLnK6Ksd6a2zcS1cTXPNCgvSFDWQiII+nch7y8",
    vkey: "y1.example/w+7b81049f+BGmJtH/FeYMFpaxnSh2R8iIAxZ5PvQXUW+BrJj6e6x3P",
  },
  y2: {
    skey: "PRIVATE+KEY+y2.example/w+69fff787+AWphpyCVn6f5Hi1gJJT4nHb5Ot2EblXbeTcHJHOkcyx6",
    vkey: "y2.example/w+03e8e4fa+BGepO98BOI0ePKwbGSiEp4oBUFOUVAUeFjYtDgYJkEgO",
  },
  y3: {
    skey: "PRIVATE+KEY+y3.example/w+89bcbb75+AfTmu0jrRh361Oq+ouQqN8n9tEc1DT/VI37q7I9Wde0Z",
    vkey: "y3.example/w+414302a4+BBu9qDSl2AMtuF3oZzB9WceZ1/d45jhXZEzUJO4gjVCI",
  },
} as const;

export type PolicyWitnessId = keyof typeof POLICY_WITNESSES;

export const keyOf = (id: PolicyWitnessId): KeyReference => {
  const parsed = parseCosignerVerifierKey(POLICY_WITNESSES[id].vkey);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  return { name: parsed.value.name, keyId: parsed.value.keyId };
};
