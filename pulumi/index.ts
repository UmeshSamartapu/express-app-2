import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";

// Create Pub/Sub Topic
const topicName = "rate-limit-events";
const topic = new gcp.pubsub.Topic(topicName, {});

// Create Cloud Run Service
const image = "gcr.io/[PROJECT-ID]/express-app"; // Replace with your built image
const service = new gcp.cloudrun.Service("express-service", {
    location: "us-central1",
    template: {
        spec: {
            containers: [
                {
                    image,
                    envs: [
                        { name: "MONGO_URI", value: process.env.MONGO_URI },
                        { name: "REDIS_URI", value: process.env.REDIS_URI },
                        { name: "TOPIC_NAME", value: topic.name },
                    ],
                },
            ],
        },
    },
});

// Configure IAM to allow Cloud Run to publish to Pub/Sub
new gcp.cloudrun.IamMember("pubsub-publisher", {
    service: service.name,
    location: service.location,
    role: "roles/pubsub.publisher",
    member: pulumi.interpolate`serviceAccount:${service.spec.serviceAccountName}`,
});

// Export Cloud Run Service URL
export const url = service.statuses[0].url;
