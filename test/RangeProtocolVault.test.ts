import { ethers } from "hardhat";
import { expect } from "chai";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import {
  IERC20,
  IUniswapV3Factory,
  IUniswapV3Pool,
  RangeProtocolVault,
  RangeProtocolFactory, LogicLib,
} from "../typechain";
import {
  bn,
  encodePriceSqrt,
  getInitializeData,
  parseEther,
  position,
  setStorageAt,
} from "./common";
import { beforeEach } from "mocha";
import { BigNumber } from "ethers";

let factory: RangeProtocolFactory;
let vaultImpl: RangeProtocolVault;
let vault: RangeProtocolVault;
let logicLib: LogicLib;
let uniV3Factory: IUniswapV3Factory;
let univ3Pool: IUniswapV3Pool;
let token0: IERC20;
let token1: IERC20;
let manager: SignerWithAddress;
let nonManager: SignerWithAddress;
let newManager: SignerWithAddress;
let user2: SignerWithAddress;
const poolFee = 3000;
const name = "Test Token";
const symbol = "TT";
const amount1: BigNumber = ethers.utils.parseUnits("1000", 6);
let initializeData: any;
const lowerTick = -887220;
const upperTick = 887220;
const GHO = "0x40D16FC0246aD3160Ccc09B8D0D3A2cD28aE6C2f";
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

describe.only("RangeProtocolVault", () => {
  before(async () => {
    [manager, nonManager, user2, newManager] = await ethers.getSigners();

    uniV3Factory = await ethers.getContractAt("IUniswapV3Factory", "0x1F98431c8aD98523631AE4a59f267346ea31F984");

    const RangeProtocolFactory = await ethers.getContractFactory(
      "RangeProtocolFactory"
    );
    factory = (await RangeProtocolFactory.deploy(
        uniV3Factory.address
    )) as RangeProtocolFactory;

    token0 = await ethers.getContractAt("MockERC20", GHO);
    token1 = await ethers.getContractAt("MockERC20", USDC);

    univ3Pool = (await ethers.getContractAt(
      "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol:IUniswapV3Pool",
      await uniV3Factory.getPool(token0.address, token1.address, poolFee)
    )) as IUniswapV3Pool;

    initializeData = getInitializeData({
      managerAddress: manager.address,
      name,
      symbol,
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
    vaultImpl = (await RangeProtocolVault.deploy()) as RangeProtocolVault;

    await factory.createVault(
      token1.address,
      poolFee,
      vaultImpl.address,
      initializeData
    );

    const vaultAddress = await factory.getVaultAddresses(0, 0);
    vault = (await ethers.getContractAt(
      "RangeProtocolVault",
      vaultAddress[0]
    )) as RangeProtocolVault;
  });

  before(async () => {
    const usdcAmount = ethers.utils.hexlify(ethers.utils.zeroPad("0x5AF3107A4000", 32))
    await setStorageAt(USDC, "0xcb8911fb82c2d10f6cf1d31d1e521ad3f4e3f42615f6ba67c454a9a2fdb9b6a7", usdcAmount);
    //
    // const ghoAmount = ethers.utils.hexlify(ethers.utils.zeroPad("0x52B7D2DCC80CD2E4000000", 32))
    // await setStorageAt(GHO, "0xc651ee22c6951bb8b5bd29e8210fb394645a94315fe10eff2cc73de1aa75c137", ghoAmount);

    // console.log((await token0.balanceOf(manager.address)).toString());
    // console.log((await token1.balanceOf(manager.address)).toString());

  })

  beforeEach(async () => {
    await token1.approve(vault.address, amount1.mul(bn(2)));
  });

  it("non-manager should not be able to updateTicks", async () => {
    await expect(
      vault.connect(nonManager).updateTicks(lowerTick, upperTick)
    ).to.be.revertedWith("Ownable: caller is not the manager");
  });

  it("should not updateTicks with out of range ticks", async () => {
    await expect(
      vault.connect(manager).updateTicks(-887273, 0)
    ).to.be.revertedWithCustomError(logicLib, "TicksOutOfRange");

    await expect(
      vault.connect(manager).updateTicks(0, 887273)
    ).to.be.revertedWithCustomError(logicLib, "TicksOutOfRange");
  });

  it("should not updateTicks with ticks not following tick spacing", async () => {
    await expect(
      vault.connect(manager).updateTicks(0, 1)
    ).to.be.revertedWithCustomError(logicLib, "InvalidTicksSpacing");

    await expect(
      vault.connect(manager).updateTicks(1, 0)
    ).to.be.revertedWithCustomError(logicLib, "InvalidTicksSpacing");
  });

  it("manager should be able to updateTicks", async () => {
    await expect(vault.connect(manager).updateTicks(lowerTick, upperTick))
      .to.emit(vault, "TicksSet")
      .withArgs(lowerTick, upperTick);

    const {lowerTick: _lowerTick, upperTick: _upperTick} = await vault.getPoolData();

    expect(_lowerTick).to.be.equal(lowerTick);
    expect(_upperTick).to.be.equal(upperTick);
  });

  it("should not allow minting with zero mint amount", async () => {
    const mintAmount = 0;
    await expect(vault.mint(mintAmount)).to.be.revertedWithCustomError(
      logicLib,
      "InvalidCollateralAmount"
    );
  });

  it("should not mint when contract is paused", async () => {
    expect(await vault.paused()).to.be.equal(false);
    await expect(vault.pause())
      .to.emit(vault, "Paused")
      .withArgs(manager.address);
    expect(await vault.paused()).to.be.equal(true);

    await expect(vault.mint(123)).to.be.revertedWith("Pausable: paused");
    await expect(vault.unpause())
      .to.emit(vault, "Unpaused")
      .withArgs(manager.address);
  });

  it("should mint with zero totalSupply of vault shares", async () => {
    expect(await vault.totalSupply()).to.be.equal(0);

    await expect(vault.mint(amount1))
      .to.emit(vault, "Minted")
      .withArgs(manager.address, amount1, amount1);

    expect(await vault.totalSupply()).to.be.equal(amount1);

    const {token, exists} = await vault.getUserVaultData(manager.address);
    expect(exists).to.be.true;
    expect(token).to.be.equal(amount1);

    const userVault = (await vault.getUserVaults(0, 0))[0];
    expect(userVault.user).to.be.equal(manager.address);
    expect(userVault.token).to.be.equal(amount1);
    expect(await vault.userCount()).to.be.equal(1);
  });

  it("should mint with non zero totalSupply", async () => {
    const totalSupply = await vault.totalSupply();
    expect(totalSupply).to.not.be.equal(0);
    const shares = amount1.mul(totalSupply).div(await vault.getUnderlyingBalance());

    await expect(vault.mint(amount1))
      .to.emit(vault, "Minted")
      .withArgs(manager.address, shares, amount1);

    const {token, exists} = await vault.getUserVaultData(manager.address);
    expect(token).to.be.equal(amount1.mul(bn(2)));

    expect(await vault.userCount()).to.be.equal(1);
  });

  it("should transfer vault shares to user2", async () => {
    const userBalance = await vault.balanceOf(manager.address);
    const transferAmount = amount1.div(2)

    const {token: tokenUser0} = await vault.getUserVaultData(manager.address);

    const vaultMoved = tokenUser0.sub(tokenUser0.mul(userBalance.sub(transferAmount)).div(userBalance));
    await vault.transfer(user2.address, transferAmount);

    const {token: tokenUser1Before} = await vault.getUserVaultData(user2.address);
    expect(await vault.userCount()).to.be.equal(2);

    expect(tokenUser1Before).to.be.equal(vaultMoved);
    const user2Balance = await vault.balanceOf(user2.address);
    await vault.connect(user2).transfer(manager.address, user2Balance);

    const {token: tokenUser1After} = await vault.getUserVaultData(user2.address);
    expect(tokenUser1After).to.be.equal(bn(0));
  });

  it("should not burn non existing vault shares", async () => {
    const burnAmount = 1
    await expect(vault.connect(user2).burn(burnAmount)).to.be.revertedWith(
      "ERC20: burn amount exceeds balance"
    );
  });

  it("should burn vault shares", async () => {
    const burnAmount = await vault.balanceOf(manager.address);
    const amountCurrent =
      await vault.getUnderlyingBalance();
    const userBalanceBefore = await token1.balanceOf(manager.address);

    const {token: userVaultTokenBefore} = await vault.getUserVaultData(manager.address);
    await vault.updateFees(50, 250);

    const {managingFee} = await vault.getFeeData();
    const totalSupply = await vault.totalSupply();
    const vaultShares = await vault.balanceOf(manager.address);
    const userBalance = amountCurrent.mul(vaultShares).div(totalSupply);
    const managingFeeAmount = userBalance.mul(managingFee).div(10_000);

    await vault.burn(burnAmount)
    expect(await vault.totalSupply()).to.be.equal(
      totalSupply.sub(burnAmount)
    );

    const amountGot = amountCurrent.mul(burnAmount).div(totalSupply);
    expect(await token1.balanceOf(manager.address)).to.be.equal(
      userBalanceBefore.add(amountGot).sub(managingFeeAmount)
    );

    const {token: userVaultTokenAfter} = await vault.getUserVaultData(manager.address);
    expect(userVaultTokenAfter).to.be.equal(bn(0));

    const {managerBalanceToken} = await vault.getFeeData();
    expect(managerBalanceToken).to.be.equal(managingFeeAmount);
  });

  describe("Manager Fee", () => {
    it("should not update managing and performance fee by non manager", async () => {
      await expect(
        vault.connect(nonManager).updateFees(100, 1000)
      ).to.be.revertedWith("Ownable: caller is not the manager");
    });

    it("should not update managing fee above BPS", async () => {
      await expect(vault.updateFees(101, 100)).to.be.revertedWithCustomError(
        logicLib,
        "InvalidManagingFee"
      );
    });

    it("should not update performance fee above BPS", async () => {
      await expect(vault.updateFees(100, 10001)).to.be.revertedWithCustomError(
        logicLib,
        "InvalidPerformanceFee"
      );
    });

    it("should update manager and performance fee by manager", async () => {
      await expect(vault.updateFees(100, 300))
        .to.emit(vault, "FeesUpdated")
        .withArgs(100, 300);
    });
  });

  describe("Add Liquidity", () => {
    beforeEach(async () => {
      await token1.approve(vault.address, amount1.mul(bn(10)));
      await token1.transfer(vault.address, amount1.mul(bn(10)))
    });

    it("should not add liquidity by non-manager", async () => {
      const amount0 = await token0.balanceOf(vault.address);
      const amount1 = await token1.balanceOf(vault.address);

      await expect(
          vault
              .connect(nonManager)
              .addLiquidity(lowerTick, upperTick, amount0, amount1)
      ).to.be.revertedWith("Ownable: caller is not the manager");
    });

    it("should add liquidity by manager", async () => {
      await token1.approve(vault.address, amount1);
      await vault.mint(amount1);
      // let {totalCollateralBase, totalDebtBase, availableBorrowsBase, currentLiquidationThreshold, ltv, healthFactor} = await vault.getAavePositionData()
      // console.log(totalCollateralBase.toString(), totalDebtBase.toString(), availableBorrowsBase.toString(), currentLiquidationThreshold.toString(), ltv.toString(), healthFactor.toString())

      // let under = await vault.getUnderlyingBalance();
      // console.log(under.toString())
      const collateral = amount1.div(2);
      await vault.supplyCollateral(collateral);

      const ghoAmount = ethers.utils.parseUnits("300", 18);
      await vault.mintGHO(ghoAmount);
      // under = await vault.getUnderlyingBalance();
      // console.log(under.toString())
      // ({totalCollateralBase, totalDebtBase, availableBorrowsBase, currentLiquidationThreshold, ltv, healthFactor} = await vault.getAavePositionData())
      // console.log(totalCollateralBase.toString(), totalDebtBase.toString(), availableBorrowsBase.toString(), currentLiquidationThreshold.toString(), ltv.toString(), healthFactor.toString())      //
      const _amount0 = await token0.balanceOf(vault.address);
      const _amount1 = await token1.balanceOf(vault.address);
      // console.log((await token0.balanceOf(vault.address)).toString())
      // console.log((await token1.balanceOf(vault.address)).toString())
      const lowerTick = -276420;
      const upperTick = -276180;
      await expect(
          await vault.addLiquidity(lowerTick, upperTick, _amount0, _amount1)
      )
          .to.emit(vault, "LiquidityAdded")
          .withArgs(anyValue, lowerTick, upperTick, anyValue, anyValue)

      // await vault.removeLiquidity();
      // const _ghoAmount = ethers.utils.hexlify(ethers.utils.zeroPad("0x52B7D2DCC80CD2E4000000", 32))
      // await setStorageAt(GHO, "0x24a02f1e8d4b44356d56d2d245541193eaa2f6837bbcbbc6609ea20423459024", _ghoAmount);
      // await vault.burnGHO(bn("115792089237316195423570985008687907853269984665640564039457584007913129639935"));
      // await vault.withdrawCollateral(bn("115792089237316195423570985008687907853269984665640564039457584007913129639935"));
      //
      // let {totalCollateralBase, totalDebtBase, availableBorrowsBase, currentLiquidationThreshold, ltv, healthFactor} = await vault.getAavePositionData()
      // console.log(totalCollateralBase.toString(), totalDebtBase.toString(), availableBorrowsBase.toString(), currentLiquidationThreshold.toString(), ltv.toString(), healthFactor.toString())      //

      // under = await vault.getUnderlyingBalance();
      // console.log(under.toString())

      console.log((await token0.balanceOf(vault.address)).toString())
      console.log((await token1.balanceOf(vault.address)).toString())

    });
  });

  // describe("Remove Liquidity", () => {
  //   it("should not remove liquidity by non-manager", async () => {
  //     await expect(
  //       vault.connect(nonManager).removeLiquidity()
  //     ).to.be.revertedWith("Ownable: caller is not the manager");
  //   });
  //
  //   it("should remove liquidity by manager", async () => {
  //     const {inThePosition, lowerTick, upperTick} = await vault.getPoolData();
  //     expect(inThePosition).to.be.equal(true);
  //     const { _liquidity: liquidityBefore } = await univ3Pool.positions(
  //       position(vault.address, lowerTick, upperTick)
  //     );
  //     expect(liquidityBefore).not.to.be.equal(0);
  //
  //     const { fee0, fee1 } = await vault.getCurrentFees();
  //     await expect(vault.removeLiquidity())
  //       .to.emit(vault, "InThePositionStatusSet")
  //       .withArgs(false)
  //       .to.emit(vault, "FeesEarned")
  //       .withArgs(fee0, fee1);
  //
  //
  //
  //     const { _liquidity: liquidityAfter } = await univ3Pool.positions(
  //       position(vault.address, lowerTick, upperTick)
  //     );
  //     expect(liquidityAfter).to.be.equal(0);
  //   });
  //
  //   it("should burn vault shares when liquidity is removed", async () => {
  //     const {lowerTick, upperTick} = await vault.getPoolData();
  //
  //     const { _liquidity: liquidity } = await univ3Pool.positions(
  //       position(vault.address, lowerTick, upperTick)
  //     );
  //
  //     expect(liquidity).to.be.equal(0);
  //     await expect(vault.removeLiquidity())
  //       .to.be.emit(vault, "InThePositionStatusSet")
  //       .withArgs(false)
  //       .not.to.emit(vault, "FeesEarned");
  //
  //     const userBalance1Before = await token1.balanceOf(manager.address);
  //     const amountCurrent =
  //       await vault.getUnderlyingBalance();
  //     const totalSupply = await vault.totalSupply();
  //     const vaultShares = await vault.balanceOf(manager.address);
  //
  //     let {managerBalanceToken: managerTokenBalanceBefore, managerBalanceGHO: managerGHOBalanceBefore, managingFee} = await vault.getFeeData();
  //     const userBalance = amountCurrent.mul(vaultShares).div(totalSupply);
  //     const managingFeeAmount = userBalance.mul(managingFee).div(10_000);
  //     await expect(vault.burn(vaultShares)).not.to.emit(vault, "FeesEarned");
  //     expect(await token1.balanceOf(manager.address)).to.be.equal(
  //       userBalance1Before.add(userBalance).sub(managingFeeAmount)
  //     );
  //
  //     let {managerBalanceToken: managerTokenBalanceAfter, managerBalanceGHO: managerGHOBalanceAfter} = await vault.getFeeData();
  //     expect(managerGHOBalanceBefore).to.be.equal(
  //       managerGHOBalanceAfter
  //     );
  //     expect(managerTokenBalanceAfter).to.be.equal(
  //       managerTokenBalanceBefore.add(managingFeeAmount)
  //     );
  //   });
  // });
  //
  // describe("Fee collection", () => {
  //   it("non-manager should not collect fee", async () => {
  //     const lowerTick = -276420;
  //     const upperTick = -276180;
  //     const _amount0 = await token0.balanceOf(vault.address);
  //     const _amount1 = await token1.balanceOf(vault.address);
  //     await vault.addLiquidity(lowerTick, upperTick, _amount0, _amount1)
  //
  //     const { sqrtPriceX96 } = await univ3Pool.slot0();
  //     const liquidity = await univ3Pool.liquidity();
  //     await token1.transfer(vault.address, amount1);
  //     const priceNext = amount1.mul(bn(2).pow(96)).div(liquidity);
  //     await vault.swap(false, amount1, sqrtPriceX96.add(priceNext));
  //
  //     // const { fee0, fee1 } = await vault.getCurrentFees();
  //     // await expect(vault.pullFeeFromPool())
  //     //   .to.emit(vault, "FeesEarned")
  //     //   .withArgs(fee0, fee1);
  //
  //     await expect(
  //       vault.connect(nonManager).collectManager()
  //     ).to.be.revertedWith("Ownable: caller is not the manager");
  //   });
  //
  //   it("should manager collect fee", async () => {
  //     await token1.transfer(vault.address, ethers.utils.parseUnits("4000", 6));
  //     const { sqrtPriceX96 } = await univ3Pool.slot0();
  //     const liquidity = await univ3Pool.liquidity();
  //     await token1.transfer(vault.address, amount1);
  //     const priceNext = amount1.mul(bn(2).pow(96)).div(liquidity);
  //     await vault.swap(false, amount1, sqrtPriceX96.add(priceNext));
  //
  //     const { fee0, fee1 } = await vault.getCurrentFees();
  //     await expect(vault.pullFeeFromPool())
  //         .to.emit(vault, "FeesEarned")
  //         .withArgs(fee0, fee1);
  //
  //     const {managerBalanceGHO: managerBalanceGHOBefore, managerBalanceToken: managerBalanceTokenBefore, performanceFee} = await vault.getFeeData();
  //
  //     const performanceFee0 = fee0
  //       .mul(performanceFee)
  //       .div(10_000);
  //     const performanceFee1 = fee0
  //       .mul(performanceFee)
  //       .div(10_000);
  //
  //     const {managerBalanceGHO: managerBalanceGHOAfter, managerBalanceToken: managerBalanceTokenAfter} = await vault.getFeeData();
  //     expect(managerBalanceGHOAfter).to.be.equal(
  //         managerBalanceGHOBefore.add(performanceFee0)
  //     );
  //     expect(managerBalanceTokenAfter).to.be.equal(
  //         managerBalanceTokenBefore.add(performanceFee1)
  //     );
  //
  //     const managerBalance0Before = await token0.balanceOf(manager.address);
  //     const managerBalance1Before = await token1.balanceOf(manager.address);
  //     await vault.connect(manager).collectManager();
  //     const managerBalance0After = await token0.balanceOf(manager.address);
  //     const managerBalance1After = await token1.balanceOf(manager.address);
  //
  //     // expect(managerBalance0After).to.be.equal(managerBalance0Before.add(fee0))
  //     // expect(managerBalance1After).to.be.equal(managerBalance1Before.add(fee1))
  //
  //     const {managerBalanceGHO: managerBalanceGHONow, managerBalanceToken: managerBalanceTokenNow} = await vault.getFeeData();
  //     expect(managerBalanceGHONow).to.be.equal(bn(0));
  //     expect(managerBalanceTokenNow).to.be.equal(bn(0));
  //   });
  // });
  //
  // describe("Test Upgradeability", () => {
  //   it("should not upgrade range vault implementation by non-manager of factory", async () => {
  //     // eslint-disable-next-line @typescript-eslint/naming-convention
  //     const RangeProtocolVault = await ethers.getContractFactory(
  //       "RangeProtocolVault",
  //         {
  //           libraries: {
  //             LogicLib: logicLib.address
  //           }
  //         }
  //     );
  //     const newVaultImpl =
  //       (await RangeProtocolVault.deploy()) as RangeProtocolVault;
  //
  //     await expect(
  //       factory
  //         .connect(nonManager)
  //         .upgradeVault(vault.address, newVaultImpl.address)
  //     ).to.be.revertedWith("Ownable: caller is not the owner");
  //
  //     await expect(
  //       factory
  //         .connect(nonManager)
  //         .upgradeVaults([vault.address], [newVaultImpl.address])
  //     ).to.be.revertedWith("Ownable: caller is not the owner");
  //   });
  //
  //   it("should upgrade range vault implementation by factory manager", async () => {
  //     // eslint-disable-next-line @typescript-eslint/naming-convention
  //     const RangeProtocolVault = await ethers.getContractFactory(
  //       "RangeProtocolVault",
  //         {
  //           libraries: {
  //             LogicLib: logicLib.address
  //           }
  //         }
  //     );
  //     const newVaultImpl =
  //       (await RangeProtocolVault.deploy()) as RangeProtocolVault;
  //
  //     const implSlot = await vaultImpl.proxiableUUID();
  //     expect(
  //       await ethers.provider.getStorageAt(vault.address, implSlot)
  //     ).to.be.equal(
  //       ethers.utils.hexZeroPad(vaultImpl.address.toLowerCase(), 32)
  //     );
  //     await expect(factory.upgradeVault(vault.address, newVaultImpl.address))
  //       .to.emit(factory, "VaultImplUpgraded")
  //       .withArgs(vault.address, newVaultImpl.address);
  //
  //     expect(
  //       await ethers.provider.getStorageAt(vault.address, implSlot)
  //     ).to.be.equal(
  //       ethers.utils.hexZeroPad(newVaultImpl.address.toLowerCase(), 32)
  //     );
  //
  //     const newVaultImpl1 =
  //       (await RangeProtocolVault.deploy()) as RangeProtocolVault;
  //
  //     expect(
  //       await ethers.provider.getStorageAt(vault.address, implSlot)
  //     ).to.be.equal(
  //       ethers.utils.hexZeroPad(newVaultImpl.address.toLowerCase(), 32)
  //     );
  //     await expect(
  //       factory.upgradeVaults([vault.address], [newVaultImpl1.address])
  //     )
  //       .to.emit(factory, "VaultImplUpgraded")
  //       .withArgs(vault.address, newVaultImpl1.address);
  //
  //     expect(
  //       await ethers.provider.getStorageAt(vault.address, implSlot)
  //     ).to.be.equal(
  //       ethers.utils.hexZeroPad(newVaultImpl1.address.toLowerCase(), 32)
  //     );
  //
  //     vaultImpl = newVaultImpl1;
  //   });
  // });
  //
  // describe("transferOwnership", () => {
  //   it("should not be able to transferOwnership by non manager", async () => {
  //     await expect(
  //       vault.connect(nonManager).transferOwnership(newManager.address)
  //     ).to.be.revertedWith("Ownable: caller is not the manager");
  //   });
  //
  //   it("should be able to transferOwnership by manager", async () => {
  //     await expect(vault.transferOwnership(newManager.address))
  //       .to.emit(vault, "OwnershipTransferred")
  //       .withArgs(manager.address, newManager.address);
  //     expect(await vault.manager()).to.be.equal(newManager.address);
  //
  //     await vault.connect(newManager).transferOwnership(manager.address);
  //     expect(await vault.manager()).to.be.equal(manager.address);
  //   });
  // });
});
