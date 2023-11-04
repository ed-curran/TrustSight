//from https://github.com/Sphereon-Opensource/wellknown-did-client/blob/develop/test/resources/verifiers/VcJsVerifier.ts
import {
  ISignedDomainLinkageCredential,
  IVerifyCallbackArgs,
  IVerifyCredentialResult,
  ProofFormatTypesEnum,
  WellKnownDidVerifier,
} from '@sphereon/wellknown-dids-client';

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { Ed25519Signature2020 } from '@digitalbazaar/ed25519-signature-2020';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { Ed25519VerificationKey2020 } from '@digitalbazaar/ed25519-verification-key-2020';
import { DocumentLoader } from './documentLoader';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import * as vc from '@digitalbazaar/vc';

export async function verifyVc(
  args: IVerifyCallbackArgs,
): Promise<IVerifyCredentialResult> {
  const keyPair = await Ed25519VerificationKey2020.generate();
  const suite = new Ed25519Signature2020({ key: keyPair });

  console.log(args);
  if (args.proofFormat === ProofFormatTypesEnum.JSON_LD) {
    suite.verificationMethod = (
      args.credential as ISignedDomainLinkageCredential
    ).credentialSubject.id;

    // return await vc.verifyCredential({
    //   credential: args.credential,
    //   suite,
    //   documentLoader: new DocumentLoader().getLoader(),
    // });
    return {
      verified: true,
    };
  }

  //todo do vc-jwt verification

  return {
    verified: true,
  };
}

export const newVerifier = () =>
  new WellKnownDidVerifier({ verifySignatureCallback: verifyVc });
