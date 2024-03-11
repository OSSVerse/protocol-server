# Introduction

The Beckn Protocol Server is a service that helps applications in connecting to the Beckn Network. It follows the Beckn Protocol, making it easier for applications to begin using Beckn Protocol. Any network participant can run this server and connect with the Beckn Network.

# Use of Protocol Server

The Protocol Server is the application that facilitates interaction between BAP and BPP with the network. Besides network interaction, it also validates network participants and keeps track of requests and responses made to the network or any network participant.

# Architecture

![image](https://github.com/beckn/protocol-server/blob/devops/guides/images/general-architecture.png)

# Components of protocol server

In the case of BAP

1. Protocol server - Client-Facing
2. Protocol server - Network-Facing

In the case of BPP

1. Protocol server - Client-Facing
2. Protocol server - Network-Facing
3. Webhook

_**\* Client and Network run the same codebase. For running the protocol server in BAP or BPP mode only change needed is at the configuration level.\***_

## BAP Scenario

### Client-Facing Protocol Server

This server manages context building, validates request bodies based on the Standard Beckn Open API schema, listens to the Message Queue, aggregates results in Synchronous mode, and forwards the results to the client-side application as a webhook callback.

### Network-Facing Protocol Server

This server forwards requests to the respective Participant or Beckn Gateway (BG). It validates incoming requests from Participants & BG according to the Standard Beckn Open API schema and verifies the signature sent from clients to ensure data integrity.

## BPP Scenario

### Client-Facing Protocol Server

This server listens to the Message Queue, forwards requests to the client-side application, exposes an endpoint for the client-side application to send results to the network. The received data is validated against the Standard Beckn Open API schema and pushed to the network-facing Protocol Server.

### Network-Facing Protocol Server

This server listens to the Message Queue, forwards requests to the respective Participant or BG, and validates incoming requests from Participants & BG based on the Standard Beckn Open API schema. It also verifies the signature sent from clients to ensure data integrity.

### Webhook

This is a Node.js application designed to function as an intermediary layer between the BPP client and the actual data source application. The application's workflow involves receiving requests from the BPP client, responding with an acknowledgment (ACK) to the BPP client, forwarding the original request to the actual data source application, receiving the response from the data source, and finally, initiating the reverse flow. The reverse flow includes triggering the 'on_action' routes of the BPP client, and the response then flows backward in the opposite direction.

[URL for Webhook-Sandbox](https://github.com/beckn/beckn-sandbox-webhook)

# Prerequisites

To run the application, make sure you have the following installed:

- [Node.js](https://nodejs.org/) version 16 or above
- [npm](https://www.npmjs.com/) version 8 or above
- [MongoDB](https://www.mongodb.com/) version 4.4 or above
- [RabbitMQ](https://www.rabbitmq.com/) version 3.8 or above
- [Redis](https://redis.io/) version 6.2 or above

_(Optional)_

- [Docker](https://www.docker.com/) version 20.10 or above

**Note:** It's recommended to set up Docker Desktop to use docker-compose for development environments (Windows/Mac). We suggest configuring MongoDB, RabbitMQ, and Redis using Docker.

# Protocol Server Setup Guide

The protocol server can be set up in two env.

1. Local System (Dev env) - [Link to local-setup.md](https://github.com/beckn/protocol-server/blob/master/Local-Setup.md)
2. Production env - [Link to prod-setup.md](https://github.com/beckn/protocol-server/blob/master/Prod-Setup.md)

<br>
<br>

# FAQs:

### Q. Use of transaction ID and message ID.

Ans: The Message ID and transaction ID serve as distinctive identifiers for API calls and the order lifecycle. The Transaction ID is employed at both BAP (Beckn Aggregator Platform) and BPP (Beckn Partner Platform) levels to monitor and identify the entire order lifecycle. On the other hand, the message_id is specifically utilized to identify individual Becknified API calls within the order lifecycle. It is also instrumental in caching the response on the BAP side by storing it in MongoDB, a dedicated system for caching responses on the BAP side.

### Q. Are these IDs mandatory or optional, if mandatory in specific cases need to mention those details.

Ans: In all instances, it is imperative to include these IDs. Should you neglect to provide either of these two IDs, the protocol server will autonomously generate them, reconstruct the context using these values, and subsequently verify the response.

### Q.What is the format of these IDs and how are they being used at the infra level i.e - Redis / MongoDB / RabbitMQ.

Ans: The IDs follow a string format. For message_id, uniqueness is crucial for each Beckn-specific API call, ensuring the receipt of fresh responses rather than cached ones. Meanwhile, transaction_id, serving to identify the entire order lifecycle at the BAP or BPP level, can vary across different order lifecycles. In the Protocol server, these IDs are generated using the random_uuid npm package.
