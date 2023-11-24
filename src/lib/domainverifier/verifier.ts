//from https://github.com/Sphereon-Opensource/wellknown-did-client/blob/develop/test/resources/verifiers/VcJsVerifier.ts
import {IVerifyCallbackArgs, ProofFormatTypesEnum, WellKnownDidVerifier,} from '@sphereon/wellknown-dids-client';
import {veramoAgent, VeramoAgent} from '@/lib/veramo/veramoAgent'

export function getVerifyCredentialCallback(agent: VeramoAgent) {
  return async (args: IVerifyCallbackArgs) => {
    //can't verify JSON-LD yet
    if(args.proofFormat === ProofFormatTypesEnum.JSON_LD) {
      return {
        verified: false
      }
    }
    try {
      const result = await agent.verifyCredential({credential: args.credential})
      return {
        verified: result.verified
      }
    } catch (e) {
      console.log(e)
      return {
        verified: false
      }
    }
  }
}

// export async function verifyVcVeramo(
//   args: IVerifyCallbackArgs,
// ): Promise<IVerifyCredentialResult> {
//   const keyPair = await Ed25519VerificationKey2020.generate();
//   const suite = new Ed25519Signature2020({ key: keyPair });
//
//   if (args.proofFormat === ProofFormatTypesEnum.JSON_LD) {
//     suite.verificationMethod = (
//       args.credential as ISignedDomainLinkageCredential
//     ).credentialSubject.id;
//
//     // return await vc.verifyCredential({
//     //   credential: args.credential,
//     //   suite,
//     //   documentLoader: new DocumentLoader().getLoader(),
//     // });
//     return {
//       verified: true
//     }
//   }
//
//   //todo do vc-jwt verification
//
//   return {
//     verified: false,
//   };
// }

export const newVerifier = async () => {
  const agent = await veramoAgent()
  const verify = getVerifyCredentialCallback(agent)
  return new WellKnownDidVerifier({ verifySignatureCallback: verify});
}
