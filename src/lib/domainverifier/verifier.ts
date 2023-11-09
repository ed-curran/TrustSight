//from https://github.com/Sphereon-Opensource/wellknown-did-client/blob/develop/test/resources/verifiers/VcJsVerifier.ts
import {
  IVerifyCallbackArgs,
  WellKnownDidVerifier,
} from '@sphereon/wellknown-dids-client';
import {veramoAgent, VeramoAgent} from '@/lib/veramo/veramoAgent'

// export async function verifyVc(
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

export function getVerifyCallback(agent: VeramoAgent) {
  return async (args: IVerifyCallbackArgs) => {
    const result = await agent.verifyCredential({credential: args.credential })
    return {
      verified: result.verified
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
  const verify = getVerifyCallback(agent)
  return new WellKnownDidVerifier({ verifySignatureCallback: verify });
}
