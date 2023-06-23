import { ethers } from "hardhat";
import { LedgerSigner } from "@anders-t/ethers-ledger";
async function main() {
  const provider = ethers.getDefaultProvider("");
  const ledger = await new LedgerSigner(provider, "");
  const ELIXIR_FACTORY = "0x43c27a9B2857C3AA5522EC2DF8d183F252DbCfE7";
  let RangeProtocolFactory = await ethers.getContractFactory(
    "RangeProtocolFactory"
  );
  RangeProtocolFactory = await RangeProtocolFactory.connect(ledger);
  const factory = await RangeProtocolFactory.deploy(ELIXIR_FACTORY);
  console.log("Factory: ", factory.address);
}
// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
