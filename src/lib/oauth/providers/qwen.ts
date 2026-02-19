import { QWEN_CONFIG } from "../constants/oauth";

function isWAFBlock(text: string): boolean {
  return (
    text.includes("aliyun.com") ||
    text.includes("alicdn.com") ||
    text.includes("potential threats to the server") ||
    text.includes("405") ||
    text.includes("<!doctype")
  );
}

export const qwen = {
  config: QWEN_CONFIG,
  flowType: "device_code",
  requestDeviceCode: async (config, codeChallenge) => {
    const response = await fetch(config.deviceCodeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        client_id: config.clientId,
        scope: config.scope,
        code_challenge: codeChallenge,
        code_challenge_method: config.codeChallengeMethod,
      }),
    });

    if (!response.ok) {
      const error = await response.text();

      if (isWAFBlock(error)) {
        throw new Error(
          "Qwen OAuth is blocked by Alibaba Cloud WAF. This commonly happens on Hugging Face Spaces. " +
            "Alternative: Use DashScope API key instead. Get your API key from https://dashscope.console.aliyun.com/ " +
            "and add it manually via Dashboard → Providers → Add Connection → API Key."
        );
      }

      throw new Error(`Device code request failed: ${error}`);
    }

    return await response.json();
  },
  pollToken: async (config, deviceCode, codeVerifier) => {
    const response = await fetch(config.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        client_id: config.clientId,
        device_code: deviceCode,
        code_verifier: codeVerifier,
      }),
    });

    return {
      ok: response.ok,
      data: await response.json(),
    };
  },
  mapTokens: (tokens) => ({
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresIn: tokens.expires_in,
    providerSpecificData: { resourceUrl: tokens.resource_url },
  }),
};
