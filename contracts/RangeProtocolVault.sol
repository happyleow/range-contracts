//SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {ERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import {IERC20MetadataUpgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/IERC20MetadataUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {IUniswapV3Pool} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {IPoolAddressesProvider} from "@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol";
import {RangeProtocolVaultStorage} from "./RangeProtocolVaultStorage.sol";
import {IRangeProtocolVault} from "./interfaces/IRangeProtocolVault.sol";
import {OwnableUpgradeable} from "./access/OwnableUpgradeable.sol";
import {DataTypesLib} from "./libraries/DataTypesLib.sol";
import {LogicLib} from "./libraries/LogicLib.sol";
import {VaultErrors} from "./errors/VaultErrors.sol";

contract RangeProtocolVault is
    Initializable,
    UUPSUpgradeable,
    ReentrancyGuardUpgradeable,
    OwnableUpgradeable,
    ERC20Upgradeable,
    PausableUpgradeable,
    RangeProtocolVaultStorage
{
    modifier onlyVault() {
        if (msg.sender != address(this)) revert();
        _;
    }

    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _pool,
        int24 _tickSpacing,
        bytes memory data
    ) external override initializer {
        (address manager, string memory _name, string memory _symbol, address _gho, address _poolAddressesProvider) = abi.decode(
            data,
            (address, string, string, address, address)
        );

        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();
        __Ownable_init();
        __ERC20_init(_name, _symbol);
        __Pausable_init();

        _transferOwnership(manager);

        state.poolData.pool = IUniswapV3Pool(_pool);
        state.poolData.token0 = IERC20Upgradeable(state.poolData.pool.token0());
        state.poolData.token1 = IERC20Upgradeable(state.poolData.pool.token1());
        state.poolData.tickSpacing = _tickSpacing;
        state.poolData.factory = msg.sender;

        state.poolData.decimals0 = IERC20MetadataUpgradeable(address(state.poolData.token0))
            .decimals();
        state.poolData.decimals1 = IERC20MetadataUpgradeable(address(state.poolData.token1))
            .decimals();

        state.aaveData.poolAddressesProvider = IPoolAddressesProvider(_poolAddressesProvider);
        if (address(state.poolData.token0) == _gho) {
            state.poolData.isToken0GHO = true;
            state.aaveData.gho = state.poolData.token0;
            state.aaveData.collateralToken = state.poolData.token1;
        } else {
            state.aaveData.gho = state.poolData.token1;
            state.aaveData.collateralToken = state.poolData.token0;
        }

        // Managing fee is 0% at the time vault initialization.
        LogicLib.updateFees(state.feeData, 0, 250);
    }

    function updateTicks(int24 _lowerTick, int24 _upperTick) external override onlyManager {
        LogicLib.updateTicks(state.poolData, _lowerTick, _upperTick);
    }

    function pause() external onlyManager {
        _pause();
    }

    function unpause() external onlyManager {
        _unpause();
    }

    function mintShares(address to, uint256 shares) external override onlyVault {
        _mint(to, shares);
    }

    function burnShares(address from, uint256 shares) external override onlyVault {
        _burn(from, shares);
    }

    function uniswapV3MintCallback(
        uint256 amount0Owed,
        uint256 amount1Owed,
        bytes calldata
    ) external override {
        LogicLib.uniswapV3MintCallback(state.poolData, amount0Owed, amount1Owed);
    }

    function uniswapV3SwapCallback(
        int256 amount0Delta,
        int256 amount1Delta,
        bytes calldata
    ) external override {
        LogicLib.uniswapV3SwapCallback(state.poolData, amount0Delta, amount1Delta);
    }

    function mint(
        uint256 amount
    ) external override nonReentrant whenNotPaused returns (uint256 shares) {
        return LogicLib.mint(state.poolData, state.feeData, state.userData, state.aaveData, amount);
    }

    function burn(
        uint256 burnAmount
    ) external override nonReentrant whenNotPaused returns (uint256 withdrawAmount) {
        return
            LogicLib.burn(
                state.poolData,
                state.feeData,
                state.userData,
                state.aaveData,
                burnAmount
            );
    }

    function removeLiquidity() external override onlyManager {
        LogicLib.removeLiquidity(state.poolData, state.feeData, state.aaveData);
    }

    function swap(
        bool zeroForOne,
        int256 swapAmount,
        uint160 sqrtPriceLimitX96
    ) external override onlyManager returns (int256 amount0, int256 amount1) {
        return LogicLib.swap(state.poolData, zeroForOne, swapAmount, sqrtPriceLimitX96);
    }

    function addLiquidity(
        int24 newLowerTick,
        int24 newUpperTick,
        uint256 amount0,
        uint256 amount1
    ) external override onlyManager returns (uint256 remainingAmount0, uint256 remainingAmount1) {
        return LogicLib.addLiquidity(state.poolData, newLowerTick, newUpperTick, amount0, amount1);
    }

    function pullFeeFromPool() external onlyManager {
        LogicLib.pullFeeFromPool(state.poolData, state.feeData, state.aaveData);
    }

    function collectManager() external override onlyManager {
        LogicLib.collectManager(state.poolData, state.feeData, manager());
    }

    function updateFees(
        uint16 newManagingFee,
        uint16 newPerformanceFee
    ) external override onlyManager {
        LogicLib.updateFees(state.feeData, newManagingFee, newPerformanceFee);
    }

    function getCurrentFees() external view override returns (uint256 fee0, uint256 fee1) {
        return LogicLib.getCurrentFees(state.poolData, state.feeData);
    }

    function getUserVaults(
        uint256 fromIdx,
        uint256 toIdx
    ) external view override returns (DataTypesLib.UserVaultInfo[] memory) {
        return LogicLib.getUserVaults(state.userData, fromIdx, toIdx);
    }

    function supplyCollateral(uint256 supplyAmount) external override onlyManager {
        LogicLib.supplyCollateral(state.aaveData, supplyAmount);
    }

    function withdrawCollateral(uint256 withdrawAmount) external override onlyManager {
        LogicLib.withdrawCollateral(state.aaveData, withdrawAmount);
    }

    function mintGHO(uint256 mintAmount) external override onlyManager {
        LogicLib.mintGHO(state.aaveData, mintAmount);
    }

    function burnGHO(uint256 burnAmount) external override onlyManager {
        LogicLib.burnGHO(state.aaveData, burnAmount);
    }

    function getAavePositionData()
        external
        view
        returns (
            uint256 totalCollateralBase,
            uint256 totalDebtBase,
            uint256 availableBorrowsBase,
            uint256 currentLiquidationThreshold,
            uint256 ltv,
            uint256 healthFactor
        )
    {
        return LogicLib.getAavePositionData(state.aaveData);
    }

    function getPositionID() public view override returns (bytes32 positionID) {
        return LogicLib.getPositionID(state.poolData);
    }

    function getUnderlyingBalance() public view override returns (uint256 amountCurrent) {
        return LogicLib.getUnderlyingBalance(state.poolData, state.feeData, state.aaveData);
    }

    function getUnderlyingBalanceByShare(
        uint256 shares
    ) external view override returns (uint256 amount) {
        return
            LogicLib.getUnderlyingBalanceByShare(
                state.poolData,
                state.feeData,
                state.aaveData,
                shares
            );
    }

    function _authorizeUpgrade(address) internal override {
        if (msg.sender != state.poolData.factory) revert VaultErrors.OnlyFactoryAllowed();
    }

    function _beforeTokenTransfer(address from, address to, uint256 amount) internal override {
        super._beforeTokenTransfer(from, to, amount);
        LogicLib._beforeTokenTransfer(state.userData, from, to, amount);
    }
}
