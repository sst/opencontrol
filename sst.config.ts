/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "opencontrol",
      removal: input?.stage === "production" ? "retain" : "remove",
      protect: ["production"].includes(input?.stage),
      home: "aws",
      providers: {
        aws: {
          region: "us-east-1",
          profile: input.stage === "production" ? "sst-production" : "sst-dev",
        },
        stripe: {
          apiKey: process.env.STRIPE_SECRET_KEY,
        },
        planetscale: "0.2.2",
        command: "1.0.2",
        random: "4.17.0",
      },
    }
  },
  console: {
    autodeploy: {
      runner(input) {
        return {
          engine: "codebuild",
          compute: "large",
          vpc:
            input.stage === "production"
              ? {
                  id: "vpc-0f06c4b635a760100",
                  subnets: ["subnet-0af5c5640dfe75a22"],
                  securityGroups: ["sg-0f360ed3d2f363121"],
                }
              : {
                  id: "vpc-069d2d529d3288945",
                  subnets: ["subnet-0b50769394a27a57d"],
                  securityGroups: ["sg-038ad39edab8e193b"],
                },
        }
      },
    },
  },
  async run() {
    await import("./infra/app")
  },
})
