import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import {
  IERC20,
  IUniswapV3Factory,
  IUniswapV3Pool,
  RangeProtocolVault,
  RangeProtocolFactory,
  LogicLib,
} from "../typechain";
import {
  bn,
  encodePriceSqrt,
  getInitializeData,
  parseEther,
  position,
  setStorageAt,
} from "./common";
import { BigNumber } from "ethers";

let factory: RangeProtocolFactory;
let vault: RangeProtocolVault;
let logicLib: LogicLib;
let uniV3Factory: IUniswapV3Factory;
let univ3Pool: IUniswapV3Pool;
let gho: IERC20;
let usdc: IERC20;
let debtGHO: IERC20;
let aToken: IERC20;
let manager: SignerWithAddress;
const poolFee = 3000;
const name = "Test Token";
const symbol = "TT";
const amount1: BigNumber = ethers.utils.parseUnits("1000", 6);
let initializeData: any;
const GHO = "0x40D16FC0246aD3160Ccc09B8D0D3A2cD28aE6C2f";
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

const MAX_UINT = bn(
  "115792089237316195423570985008687907853269984665640564039457584007913129639935"
);

describe("Test suite for Aave", () => {
  before(async () => {
    [manager] = await ethers.getSigners();
    uniV3Factory = await ethers.getContractAt(
      "IUniswapV3Factory",
      "0x1F98431c8aD98523631AE4a59f267346ea31F984"
    );
    const RangeProtocolFactory = await ethers.getContractFactory(
      "RangeProtocolFactory"
    );
    factory = (await RangeProtocolFactory.deploy(
      uniV3Factory.address
    )) as RangeProtocolFactory;
    gho = await ethers.getContractAt("MockERC20", GHO);
    usdc = await ethers.getContractAt("MockERC20", USDC);
    debtGHO = await ethers.getContractAt(
      "MockERC20",
      "0x786dbff3f1292ae8f92ea68cf93c30b34b1ed04b"
    );
    aToken = await ethers.getContractAt(
      "MockERC20",
      "0x98C23E9d8f34FEFb1B7BD6a91B7FF122F4e16F5c"
    );
    univ3Pool = (await ethers.getContractAt(
      "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol:IUniswapV3Pool",
      await uniV3Factory.getPool(gho.address, usdc.address, poolFee)
    )) as IUniswapV3Pool;
    initializeData = getInitializeData({
      managerAddress: manager.address,
      name,
      symbol,
      gho: "0x40D16FC0246aD3160Ccc09B8D0D3A2cD28aE6C2f",
      poolAddressesProvider: "0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e"
    });
    const LogicLib = await ethers.getContractFactory("LogicLib");
    logicLib = await LogicLib.deploy();
    const RangeProtocolVault = await ethers.getContractFactory(
      "RangeProtocolVault",
      {
        libraries: {
          LogicLib: logicLib.address,
        },
      }
    );
    const vaultImpl = (await RangeProtocolVault.deploy()) as RangeProtocolVault;
    await factory.createVault(
      usdc.address,
      poolFee,
      vaultImpl.address,
      initializeData
    );
    const vaultAddress = await factory.getVaultAddresses(0, 0);
    vault = (await ethers.getContractAt(
      "RangeProtocolVault",
      vaultAddress[0]
    )) as RangeProtocolVault;

    await setStorageAt(
      USDC,
      ethers.utils.keccak256(
        ethers.utils.defaultAbiCoder.encode(
          ["address", "uint256"],
          [manager.address, 9]
        )
      ),
      ethers.utils.hexlify(ethers.utils.zeroPad("0x54B40B1F852BDA000000", 32))
    );
  });

  it("Test suite", async () => {
    const usdcDepositAmount = ethers.utils.parseUnits("100000", 6);
    await usdc.approve(vault.address, usdcDepositAmount);
    await vault.mint(usdcDepositAmount);

    console.log(
      "User vault balance: ",
      (await vault.balanceOf(manager.address)).toString()
    );
    console.log(
      "Vault USDC balance: ",
      (await usdc.balanceOf(vault.address)).toString()
    );

    await vault.supplyCollateral(usdcDepositAmount.div(bn(2)));
    const ghoMintAmount = usdcDepositAmount
      .div(bn(2))
      .mul(bn(10).pow(12))
      .mul(70)
      .div(100);
    await vault.mintGHO(ghoMintAmount);
    console.log(
      "After supplying 50k usdc to aave as supply and borrowing 35k GHO"
    );
    console.log(
      "Vault USDC balance: ",
      (await usdc.balanceOf(vault.address)).toString()
    );
    console.log(
      "Vault GHO balance: ",
      (await gho.balanceOf(vault.address)).toString()
    );

    const lowerTick = -276480;
    const upperTick = -276300;

    const usdcBalance = await usdc.balanceOf(vault.address);
    const ghoBalance = await gho.balanceOf(vault.address);

    const data = await (
      await vault.addLiquidity(lowerTick, upperTick, ghoBalance, usdcBalance)
    ).wait();
    console.log(
      "Vault balance after adding maximum liquidity to uniswap v3 0.3% pool"
    );
    console.log(
      "Vault USDC balance: ",
      (await usdc.balanceOf(vault.address)).toString()
    );
    console.log(
      "Vault GHO balance: ",
      (await gho.balanceOf(vault.address)).toString()
    );

    await vault.swap(
      false,
      ethers.utils.parseUnits("1000", 6),
      bn("146144670348521010328727305220398882237872397034")
    );
    console.log("Vault balance after swapping 1000 usdc to gho");
    console.log(
      "Vault USDC balance: ",
      (await usdc.balanceOf(vault.address)).toString()
    );
    console.log(
      "Vault GHO balance: ",
      (await gho.balanceOf(vault.address)).toString()
    );

    await vault.removeLiquidity();
    console.log("Vault balance after removing liquidity from uniswap");
    console.log(
      "Vault USDC balance: ",
      (await usdc.balanceOf(vault.address)).toString()
    );
    console.log(
      "Vault GHO balance: ",
      (await gho.balanceOf(vault.address)).toString()
    );

    let { totalCollateralBase, totalDebtBase } =
      await vault.getAavePositionData();
    await vault.burnGHO(MAX_UINT);
    console.log("Vault balance after paying back debt");
    console.log(
      "Vault USDC balance: ",
      (await usdc.balanceOf(vault.address)).toString()
    );
    console.log(
      "Vault GHO balance: ",
      (await gho.balanceOf(vault.address)).toString()
    );

    await vault.withdrawCollateral(MAX_UINT);
    console.log("Vault balance after withdrawing collateral");
    console.log(
      "Vault USDC balance: ",
      (await usdc.balanceOf(vault.address)).toString()
    );
    console.log(
      "Vault GHO balance: ",
      (await gho.balanceOf(vault.address)).toString()
    );
    ({ totalCollateralBase, totalDebtBase } =
      await vault.getAavePositionData());
    console.log(totalCollateralBase.toString(), totalDebtBase.toString());
    const _ghoBalance = await gho.balanceOf(vault.address);
    await vault.swap(true, _ghoBalance, 4295128740);
    console.log(
      (await vault.getUnderlyingBalance()).toString(),
      (await vault.balanceOf(manager.address)).toString(),
      (await vault.totalSupply()).toString()
    );
    // await vault.burn(usdcDepositAmount);

    console.log("Vault balance after position is closed");
    console.log(
      "Vault USDC balance: ",
      (await usdc.balanceOf(vault.address)).toString()
    );
    console.log(
      "Vault GHO balance: ",
      (await gho.balanceOf(vault.address)).toString()
    );
  });
});
