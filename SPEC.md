# LobbyPing

Privacy-First Arrival Notification System

Version: MVP v1.0

Status: Ready For Development

---

# Overview

LobbyPing is a lightweight arrival notification system designed for apartments, condos, and small residential buildings.

When a visitor arrives, they scan a QR code, enter a room number, and send an arrival notification.

Residents receive an instant push notification and can respond with simple actions.

LobbyPing does not replace access control.

LobbyPing does not unlock doors.

LobbyPing does not provide video or voice communication.

LobbyPing simply ensures that residents know someone is waiting downstairs.

---

# Problem

Many small residential buildings experience:

- Broken intercom systems
- Aging doorbell systems
- Expensive replacement costs
- Long repair timelines
- No reliable visitor notification method

Common consequences:

- Packages abandoned in lobbies
- Food deliveries missed
- Guests unable to contact residents
- Frequent resident complaints

Residents only need one thing:

"Someone is downstairs right now."

---

# Product Vision

Visitor:

"I'm here."

Resident:

"I know."

LobbyPing exists to reduce uncertainty and improve delivery success without introducing unnecessary complexity.

---

# Product Principles

## Room First

The room is the primary entity.

Notifications are routed by room number.

Not by:

- phone number
- email address
- resident directory

---

## Privacy First

No public resident information.

No resident directory.

No visitor profile.

No phone number sharing.

Minimal data collection.

---

## Ephemeral Events

Arrival events only exist long enough to coordinate a delivery or visit.

Events automatically expire.

No permanent visitor history.

No surveillance.

---

## Simple Communication

LobbyPing is not:

- Chat
- Messaging
- Email
- Video Call
- Voice Call
- Door Unlock

The system coordinates arrival only.

---

# User Types

## Resident

Receives notifications.

Configures delivery instructions.

Responds to arrival requests.

---

## Visitor

Delivery drivers

Food couriers

Guests

Service providers

Sends arrival notifications.

---

## Building Administrator

Creates rooms.

Generates invite codes.

Prints building QR codes.

Manages onboarding.

---

# Resident Registration

Invitation-only.

No public signups.

---

## Invite Code Flow

Building Admin creates:

Room 101

Invite Code: ABC123

Resident redeems invite code.

Invite code becomes invalid after redemption.

---

## Device Registration

One room may have multiple devices.

Example:

Room 101

- Alice iPhone
- Bob Android
- iPad

All devices receive notifications.

First response wins.

---

# Visitor Flow

1. Scan building QR code

2. Open LobbyPing visitor page

3. Enter room number

4. Select arrival type

Options:

- Package
- Food Delivery
- Guest
- Other

5. Select expected wait time

Options:

- 1 minute
- 2 minutes
- 5 minutes

6. Send notification

---

# Arrival Notification Flow

Arrival Event Created

↓

Push Notification Sent

↓

Resident Receives Notification

↓

Resident Responds

↓

Visitor Sees Response

↓

Event Expires

↓

Automatic Deletion

---

# Resident Responses

Residents may respond using predefined actions.

---

## Coming Down

Visitor sees:

Resident is coming down.

---

## Leave In Lobby

Visitor sees:

Please leave item in lobby.

---

## No Need To Wait

Visitor sees:

No need to wait.

---

# Reminder System

Visitors may send reminders.

Purpose:

Handle missed notifications.

Prevent notification failure.

Rules:

- Maximum reminders: 3
- Cooldown between reminders: 30 seconds
- Reminder count visible to visitor

---

# Delivery Instructions

Residents may configure fallback instructions.

Purpose:

Provide guidance when notifications fail or residents are unavailable.

---

## Package Instructions

Example:

Leave package inside parcel locker.

---

## Food Instructions

Example:

Please wait two minutes.

If nobody responds, leave at front desk.

---

## Guest Instructions

Example:

Resident will come downstairs.

---

# Instruction Display Logic

Notification Sent

↓

Resident Responds

↓

Show Resident Response

OR

↓

No Response

↓

Show Delivery Instructions

---

# Notification Setup Wizard

This is a critical feature.

Many users have never configured Web Push notifications before.

The setup wizard ensures reliable notification delivery.

---

## Step 1

Open LobbyPing in Safari.

---

## Step 2

Tap Share.

---

## Step 3

Tap Add To Home Screen.

---

## Step 4

Open LobbyPing from Home Screen.

---

## Step 5

Enable Notifications.

---

## Step 6

Send Test Notification.

---

## Step 7

Verify:

- Notification received
- Sound enabled
- Focus Mode not blocking notifications

---

## Setup Success

Display:

✓ LobbyPing is ready

---

# Privacy Model

LobbyPing intentionally stores minimal information.

---

## Stored Permanently

Building

Room

Invite Code

Push Token

Notification Preferences

Delivery Instructions

---

## Stored Temporarily

Active Arrival Events

Reminder State

Delivery Status

---

## Automatically Deleted

Expired Events

Visitor Activity

Temporary Notification State

Retention:

30 minutes

---

## Never Stored

Visitor History

Visitor Profiles

Phone Numbers

Email Addresses

Photos

Chat Messages

Package History

Delivery Logs

Resident Activity History

---

# Abuse Prevention

Room enumeration protection

Rate limiting

Reminder limits

Cooldown timers

Bot protection

Notification throttling

Invite-only registration

---

# Building QR Code

One QR code per building.

Visitor scans QR code.

Visitor manually enters room number.

No resident list is exposed.

---

# Success Metrics

## Primary

Notification Delivery Rate

Resident Response Rate

Median Response Time

---

## Secondary

Reminder Usage Rate

Instruction Usage Rate

Setup Completion Rate

Test Notification Success Rate

---

# Technical Architecture

## Frontend

React

Vite

TypeScript

---

## UI Framework

Tailwind CSS

shadcn/ui

Radix UI

---

## Form Handling

React Hook Form

Zod

---

## PWA

vite-plugin-pwa

Web App Manifest

Service Worker

Add To Home Screen Support

Web Push Notifications

---

## Backend

Firebase

---

## Authentication

Anonymous Authentication

Invite Code Verification

---

## Database

Firestore

---

## Push Notifications

Firebase Cloud Messaging (FCM)

---

## Backend Logic

Firebase Cloud Functions

---

## Hosting

GitHub Pages

---

## Storage

None

No file uploads

No image uploads

---

## Analytics

Minimal operational metrics only

No user behavior tracking

---

# Agent Development Requirements

## Mandatory Rule

Use existing UI libraries.

Do not build interfaces with raw HTML and custom CSS from scratch.

---

## Required Component Library

shadcn/ui

Radix UI

---

## Required Components

Button

Card

Input

Textarea

Select

Dialog

Toast

Alert

Badge

Tabs

Form

Switch

Progress

Skeleton

---

## Styling

Tailwind CSS

Custom CSS should be minimal.

Use design tokens and existing components whenever possible.

---

## Development Philosophy

Prefer:

- Existing components
- Existing patterns
- Accessibility-compliant primitives

Avoid:

- Hand-written UI primitives
- Large custom CSS files
- Reinventing common components

---

# Assets

## Icons

- `icon-dark.png` — dark mode icon (navy building, red notification bell, dark background)
- `icon-light.png` — light mode icon (orange building, red notification bell, white background)

Use `icon-light.png` as PWA manifest icon and favicon default.

Use `icon-dark.png` for dark-mode PWA manifest icon variant.

---

# Future Features (Not MVP)

SMS Fallback

Telegram Integration

Resident Availability Status

Multiple Buildings

HOA Dashboard

Native iOS App

Native Android App

Package Photos

Visitor Messaging

Voice Calling

Video Calling

Door Unlocking

Access Control
