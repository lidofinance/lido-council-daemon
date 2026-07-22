# Contract bytecode fixtures

These fixtures make contract integration tests self-contained. Tests must not
read artifacts from a neighbouring `core` or
`execution-delegation-framework` checkout.

ABIs follow the daemon's regular workflow and live in `src/abi`:

- `src/abi/security-v5.abi.json`;
- `src/abi/delegation-contract.abi.json`.

`yarn typechain` generates their ethers-v5 factories together with the other
project ABIs.

Creation bytecode and its provenance live in this directory. Each JSON file
records the source repository, exact commit, compiler version and source path.
When a source contract changes, update its ABI and bytecode fixture in the same
commit and regenerate TypeChain output locally before running the tests.

`data-bus.bytecode.json` contains the local Data Bus test contract bytecode
previously embedded in `data-bus.client.e2e-spec.ts`. It is a daemon-owned test
fixture and does not come from either external contracts repository.
