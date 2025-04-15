import { createHash } from "crypto"
import { storagePublic } from "./shared"
import { api } from "./app"
import { domain } from "./stage"

export const identity = aws.getCallerIdentityOutput()

const cfnTemplate = $jsonStringify({
  AWSTemplateFormatVersion: "2010-09-09",
  Description: "Connect your AWS account to access OpenControl.",
  Parameters: {
    workspaceID: {
      Type: "String",
      Description: "This is the ID of your OpenControl workspace, do not edit.",
    },
  },
  Resources: {
    AssumeRole: {
      Type: "AWS::IAM::Role",
      Properties: {
        RoleName: {
          "Fn::Sub": "opencontrol-${workspaceID}-${AWS::Region}",
        },
        AssumeRolePolicyDocument: {
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: {
                AWS: identity.accountId,
              },
              Action: "sts:AssumeRole",
              Condition: {
                StringEquals: {
                  "sts:ExternalId": {
                    Ref: "workspaceID",
                  },
                },
              },
            },
          ],
        },
        ManagedPolicyArns: ["arn:aws:iam::aws:policy/AdministratorAccess"],
      },
    },
    NotifierRole: {
      Type: "AWS::IAM::Role",
      Properties: {
        RoleName: {
          "Fn::Sub": "opencontrol-connect-${workspaceID}-${AWS::Region}",
        },
        AssumeRolePolicyDocument: {
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: {
                Service: "lambda.amazonaws.com",
              },
              Action: "sts:AssumeRole",
            },
          ],
        },
        ManagedPolicyArns: [
          "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
        ],
      },
    },
    Notifier: {
      Type: "AWS::Lambda::Function",
      Properties: {
        FunctionName: {
          "Fn::Sub": "opencontrol-connect-${workspaceID}",
        },
        Code: {
          ZipFile: `
exports.handler = async (event) => {
  console.log(event);

  let status = "SUCCESS";

  if (event.RequestType === "Create") {
    try {
      await fetch(process.env.API_ENDPOINT + "/aws/connect", {
        method: "POST",
        body: JSON.stringify({
          workspaceID: event.ResourceProperties.workspaceID,
          region: event.ResourceProperties.region,
          role: event.ResourceProperties.role,
        }),
        headers: {
          "Content-Type": "application/json",
        },
      });
    } catch(e) {
      console.error(e);
      status = "FAILED";
    }
  }

  if (event.RequestType === "Delete") {
    try {
      await fetch(process.env.API_ENDPOINT + "/aws/disconnect", {
        method: "POST",
        body: JSON.stringify({
          workspaceID: event.ResourceProperties.workspaceID,
          region: event.ResourceProperties.region,
          role: event.ResourceProperties.role,
        }),
        headers: {
          "Content-Type": "application/json",
        },
      });
    } catch(e) {
      console.error(e);
      status = "FAILED";
    }
  }

  await fetch(event.ResponseURL, {
    method: "PUT",
    body: JSON.stringify({
      Status: status,
      Reason: "",
      StackId: event.StackId,
      RequestId: event.RequestId,
      PhysicalResourceId: "none",
      LogicalResourceId: event.LogicalResourceId,
    }),
  });
}
          `,
        },
        Environment: {
          Variables: {
            API_ENDPOINT: api.url,
          },
        },
        Handler: "index.handler",
        Runtime: "nodejs22.x",
        Role: { "Fn::GetAtt": ["NotifierRole", "Arn"] },
        MemorySize: 1024,
        Timeout: 900,
      },
    },
    Connect: {
      Type: "Custom::Connect",
      Properties: {
        ServiceToken: {
          "Fn::GetAtt": ["Notifier", "Arn"],
        },
        region: {
          Ref: "AWS::Region",
        },
        role: {
          "Fn::GetAtt": ["AssumeRole", "Arn"],
        },
        workspaceID: {
          Ref: "workspaceID",
        },
      },
    },
  },
  Outputs: {},
})

const template = new aws.s3.BucketObjectv2("ConnectCfnTemplate", {
  bucket: storagePublic.name,
  key: cfnTemplate.apply(
    (v) =>
      `connect/template-${createHash("sha256").update(v).digest("hex").substring(0, 6)}.json`,
  ),
  content: cfnTemplate,
})

export const templateUrl = $interpolate`https://${storagePublic.nodes.bucket.bucketRegionalDomainName}/${template.key}`
