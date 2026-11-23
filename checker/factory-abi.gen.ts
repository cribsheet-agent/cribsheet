// Generated from checker/factory-abi.json by scripts/embed.mjs. Do not edit.
export const FACTORY_ABI_ITEMS = [
 {
  "type": "event",
  "signature": "BuybackEnabledUpdated(address,bool,address)"
 },
 {
  "type": "event",
  "signature": "CreatorFeeRecipientChangeCancelled(address,address)"
 },
 {
  "type": "event",
  "signature": "CreatorFeeRecipientChangeProposed(address,address,address,uint256,uint256)"
 },
 {
  "type": "event",
  "signature": "CreatorFeeRecipientUpdated(address,address,address)"
 },
 {
  "type": "event",
  "signature": "GraduationExecutorSet(address)"
 },
 {
  "type": "event",
  "signature": "GraduationTokensPermanentlyLocked(address,uint256)"
 },
 {
  "type": "event",
  "signature": "LaunchConfigAdded(uint256)"
 },
 {
  "type": "event",
  "signature": "LaunchConfigUpdated(uint256)"
 },
 {
  "type": "event",
  "signature": "LaunchDeployerSet(address)"
 },
 {
  "type": "event",
  "signature": "LaunchEnabledUpdated(bool)"
 },
 {
  "type": "event",
  "signature": "LaunchFeeUpdated(uint256)"
 },
 {
  "type": "event",
  "signature": "LaunchForceSwept(address)"
 },
 {
  "type": "event",
  "signature": "LaunchForwarderSet(address)"
 },
 {
  "type": "event",
  "signature": "LaunchGraduationRescued(address,address,uint256,uint256)"
 },
 {
  "type": "event",
  "signature": "LaunchSwept(address,uint256,uint256)"
 },
 {
  "type": "event",
  "signature": "MaxCreatorTaxUpdated(uint256)"
 },
 {
  "type": "event",
  "signature": "OwnershipTransferStarted(address,address)"
 },
 {
  "type": "event",
  "signature": "OwnershipTransferred(address,address)"
 },
 {
  "type": "event",
  "signature": "PairTokenApprovalUpdated(address,bool)"
 },
 {
  "type": "event",
  "signature": "PairTokenEconomicsUpdated(address,uint256,uint256,uint8)"
 },
 {
  "type": "event",
  "signature": "PoolGraduated(address,uint256,uint256,uint256)"
 },
 {
  "type": "event",
  "signature": "SnipeTaxSecondsUpdated(uint256)"
 },
 {
  "type": "event",
  "signature": "SnipeTaxStartBpsUpdated(uint256)"
 },
 {
  "type": "event",
  "signature": "TokenLaunched(address,address,address,address,uint256,uint256)"
 },
 {
  "type": "event",
  "signature": "WhitelistedLauncherUpdated(address,bool)"
 },
 {
  "type": "function",
  "signature": "CREATOR_FEE_RECIPIENT_EXECUTION_WINDOW()"
 },
 {
  "type": "function",
  "signature": "CREATOR_FEE_RECIPIENT_TIMELOCK()"
 },
 {
  "type": "function",
  "signature": "GRADUATION_RESCUE_DELAY()"
 },
 {
  "type": "function",
  "signature": "acceptOwnership()"
 },
 {
  "type": "function",
  "signature": "addLaunchConfig((uint256,uint256,uint256,uint256,uint24,int24,bool))"
 },
 {
  "type": "function",
  "signature": "approvedPairTokens(address)"
 },
 {
  "type": "function",
  "signature": "buybackVault()"
 },
 {
  "type": "function",
  "signature": "canLaunch(address)"
 },
 {
  "type": "function",
  "signature": "cancelCreatorFeeRecipientChange(address)"
 },
 {
  "type": "function",
  "signature": "createGraduatedPool(address)"
 },
 {
  "type": "function",
  "signature": "executeCreatorFeeRecipientChange(address)"
 },
 {
  "type": "function",
  "signature": "feeEscrow()"
 },
 {
  "type": "function",
  "signature": "forceSweptGraduation(address)"
 },
 {
  "type": "function",
  "signature": "getLaunchConfig(uint256)"
 },
 {
  "type": "function",
  "signature": "getLaunchFeePolicy(address)"
 },
 {
  "type": "function",
  "signature": "getLaunchedToken(address)"
 },
 {
  "type": "function",
  "signature": "graduate(address)"
 },
 {
  "type": "function",
  "signature": "graduationExecutor()"
 },
 {
  "type": "function",
  "signature": "graduationGuard()"
 },
 {
  "type": "function",
  "signature": "launchConfigCount()"
 },
 {
  "type": "function",
  "signature": "launchDeployer()"
 },
 {
  "type": "function",
  "signature": "launchEnabled()"
 },
 {
  "type": "function",
  "signature": "launchFee()"
 },
 {
  "type": "function",
  "signature": "launchForwarder()"
 },
 {
  "type": "function",
  "signature": "launchToken((string,string,string,string,(string,string,string,string,string),address,uint16,bool,bytes32,bytes32),uint256,address,address[])"
 },
 {
  "type": "function",
  "signature": "launchToken((string,string,string,string,(string,string,string,string,string),address,uint16,bool,bytes32,bytes32),uint256,address)"
 },
 {
  "type": "function",
  "signature": "launchTokenFor((string,string,string,string,(string,string,string,string,string),address,uint16,bool,bytes32,bytes32),uint256,address,address,address[])"
 },
 {
  "type": "function",
  "signature": "locker()"
 },
 {
  "type": "function",
  "signature": "maxCreatorTaxBps()"
 },
 {
  "type": "function",
  "signature": "memeHook()"
 },
 {
  "type": "function",
  "signature": "owner()"
 },
 {
  "type": "function",
  "signature": "pairTokenEconomics(address)"
 },
 {
  "type": "function",
  "signature": "pendingCreatorFeeRecipient(address)"
 },
 {
  "type": "function",
  "signature": "pendingOwner()"
 },
 {
  "type": "function",
  "signature": "permit2()"
 },
 {
  "type": "function",
  "signature": "poolManager()"
 },
 {
  "type": "function",
  "signature": "positionManager()"
 },
 {
  "type": "function",
  "signature": "previewLaunchEconomics(uint256,address)"
 },
 {
  "type": "function",
  "signature": "renounceOwnership()"
 },
 {
  "type": "function",
  "signature": "rescueCurveFees(address)"
 },
 {
  "type": "function",
  "signature": "rescueSweptGraduation(address,address)"
 },
 {
  "type": "function",
  "signature": "setBuybackEnabled(address,bool)"
 },
 {
  "type": "function",
  "signature": "setCreatorFeeRecipient(address,address)"
 },
 {
  "type": "function",
  "signature": "setGraduationExecutor(address)"
 },
 {
  "type": "function",
  "signature": "setLaunchDeployer(address)"
 },
 {
  "type": "function",
  "signature": "setLaunchEnabled(bool)"
 },
 {
  "type": "function",
  "signature": "setLaunchFee(uint256)"
 },
 {
  "type": "function",
  "signature": "setLaunchForwarder(address)"
 },
 {
  "type": "function",
  "signature": "setMaxCreatorTaxBps(uint256)"
 },
 {
  "type": "function",
  "signature": "setPairTokenApproved(address,bool)"
 },
 {
  "type": "function",
  "signature": "setPairTokenEconomics(address,uint256,uint256,uint8)"
 },
 {
  "type": "function",
  "signature": "setSnipeTaxSeconds(uint256)"
 },
 {
  "type": "function",
  "signature": "setSnipeTaxStartBps(uint256)"
 },
 {
  "type": "function",
  "signature": "setWhitelistedLauncher(address,bool)"
 },
 {
  "type": "function",
  "signature": "snipeTaxSeconds()"
 },
 {
  "type": "function",
  "signature": "snipeTaxStartBps()"
 },
 {
  "type": "function",
  "signature": "transferCreatorFeeRecipient(address,address)"
 },
 {
  "type": "function",
  "signature": "transferOwnership(address)"
 },
 {
  "type": "function",
  "signature": "updateLaunchConfig(uint256,(uint256,uint256,uint256,uint256,uint24,int24,bool))"
 },
 {
  "type": "function",
  "signature": "whitelistedLaunchers(address)"
 }
] as const;
