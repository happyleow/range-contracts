//SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {IUniswapV3Pool} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {DataTypesLib} from "../libraries/DataTypesLib.sol";

interface IRangeProtocolVaultGetters {
    function factory() external view returns (address);

    function pool() external view returns (IUniswapV3Pool);

    function token0() external view returns (IERC20Upgradeable);

    function token1() external view returns (IERC20Upgradeable);

    function lowerTick() external view returns (int24);

    function upperTick() external view returns (int24);

    function tickSpacing() external view returns (int24);

    function inThePosition() external view returns (bool);

    function isToken0GHO() external view returns (bool);

    function managingFee() external view returns (uint16);

    function performanceFee() external view returns (uint16);

    function managerBalanceGHO() external view returns (uint256);

    function managerBalanceToken() external view returns (uint256);

    function userVaults(address user) external view returns (DataTypesLib.UserVault memory);

    function userCount() external view returns (uint256);

    function users(uint256 index) external view returns (address);

    function poolAddressesProvider() external view returns (address);

    function gho() external view returns (address);

    function collateralToken() external view returns (address);
}