import { ethers } from "hardhat";
import { LedgerSigner } from "@anders-t/ethers-ledger";
async function main() {
    const provider = ethers.getDefaultProvider("");
    const ledger = await new LedgerSigner(provider, "");
    let LogicLib = await ethers.getContractFactory(
        "LogicLib"
    );
    LogicLib = await LogicLib.connect(ledger);
    const logicLib = await LogicLib.deploy();
    console.log("logicLib: ", logicLib.address);
}
// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
