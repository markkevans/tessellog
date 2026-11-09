import { createAppender, createMemoryDriver } from "@tessellog/appender";
import { createHttpFetcher, createLogClient } from "@tessellog/client";
import { parsePolicy, type NoteSigner, type NoteVerifier } from "@tessellog/core";

const policyText = `
witness W1 example.com/witness+b23d4f67+BEVLyBUt2RhO0bBma3n+Ox0colWVon+MUax/RUnjJ/aa https://witness.example.com/
witness W2 example.org/witness+c3acd4d0+BEgafMlEzlQ0GMmcJUn07hgy9nlILMIEgU3hWixaJy6s https://witness.example.org/
group either any W1 W2
quorum either
`;

const policy = parsePolicy(policyText);
if (!policy.ok) throw new Error(policy.error);

export const witnessedAppender = (signer: NoteSigner) =>
  createAppender({
    driver: createMemoryDriver(),
    signer,
    witnessing: { policy: policy.value, timeout: 2_000 },
  });

export const witnessCheckingClient = (logVerifier: NoteVerifier) =>
  createLogClient({
    fetcher: createHttpFetcher({ baseUrl: "https://log.example.com/" }),
    origin: logVerifier.name,
    logVerifier,
    witnessPolicy: policy.value,
  });
