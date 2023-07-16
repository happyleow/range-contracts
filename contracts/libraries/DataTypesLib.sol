//SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {IUniswapV3Pool} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {IPool} from "@aave/core-v3/contracts/interfaces/IPool.sol";
import {IPoolAddressesProvider} from "@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol";

library DataTypesLib {
    struct PoolData {
        address factory;
        IUniswapV3Pool pool;
        IERC20Upgradeable token0;
        IERC20Upgradeable token1;
        int24 lowerTick;
        int24 upperTick;
        int24 tickSpacing;
        bool inThePosition;
        bool isToken0GHO;
        uint8 decimals0;
        uint8 decimals1;
    }

    struct FeeData {
        uint16 managingFee;
        uint16 performanceFee;
        uint256 managerBalanceGHO;
        uint256 managerBalanceToken;
    }

    struct UserData {
        mapping(address => UserVault) vaults;
        address[] users;
    }

    struct AaveData {
        IPool aPool;
        IPoolAddressesProvider provider;
        IERC20Upgradeable gho;
        //        IERC20Upgradeable aToken;
        IERC20Upgradeable collateralToken;
    }

    struct UserVault {
        bool exists;
        uint256 token;
    }

    struct UserVaultInfo {
        address user;
        uint256 token;
    }

    struct State {
        PoolData poolData;
        FeeData feeData;
        UserData userData;
        AaveData aaveData;
    }
}
