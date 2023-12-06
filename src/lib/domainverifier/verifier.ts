//from https://github.com/Sphereon-Opensource/wellknown-did-client/blob/develop/test/resources/verifiers/VcJsVerifier.ts
import {
  IVerifyCallbackArgs,
  ProofFormatTypesEnum,
  WellKnownDidVerifier,
} from '@sphereon/wellknown-dids-client';
import { veramoAgent, VeramoAgent } from '@/lib/veramo/veramoAgent';

export function getVerifyCredentialCallback(agent: VeramoAgent) {
  return async (args: IVerifyCallbackArgs) => {
    //can't verify JSON-LD yet
    if (args.proofFormat === ProofFormatTypesEnum.JSON_LD) {
      console.log(
        "warn: TrustSight doesn't support JSON_LD domain linked credentials yet. Signature will be considered invalid.",
      );
      return {
        verified: false,
      };
    }
    try {
      const result = await agent.verifyCredential({
        credential: args.credential,
      });
      return {
        verified: result.verified,
      };
    } catch (e) {
      console.log(e);
      return {
        verified: false,
      };
    }
  };
}

export const newVerifier = async () => {
  const agent = await veramoAgent();
  const verify = getVerifyCredentialCallback(agent);
  return new WellKnownDidVerifier({ verifySignatureCallback: verify });
};
