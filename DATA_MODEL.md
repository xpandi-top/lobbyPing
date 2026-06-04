# LobbyPing Data Model

## Collections

`buildings/{buildingId}`

- `name`
- `qrSlug`
- `createdAt`

`buildings/{buildingId}/rooms/{roomId}`

- `number`
- `instructions.package`
- `instructions.food`
- `instructions.guest`
- `createdAt`

`buildings/{buildingId}/rooms/{roomId}/inviteCodes/{codeId}`

- `code`
- `buildingId`
- `roomId`
- `role`: `owner` or `member`
- `redeemed`
- `redeemedAt`
- `redeemedByDeviceId`
- `createdBy`
- `expiresAt`
- `permissions.notify`
- `permissions.respond`
- `createdAt`

`buildings/{buildingId}/rooms/{roomId}/devices/{deviceId}`

- `fcmToken`
- `platform`: `ios`, `android`, or `web`
- `role`
- `userId`: Firebase Auth UID
- `codeId`
- `permissions`
- `name`
- `registeredAt`

`buildings/{buildingId}/rooms/{roomId}/residents/{uid}`

- `deviceId`
- `role`
- `permissions`
- `name`
- `updatedAt`

`buildings/{buildingId}/rooms/{roomId}/arrivals/{arrivalId}`

- `visitorUid`
- `roomNumber`
- `type`: `package`, `food`, `guest`, or `other`
- `waitTime`: `1min`, `2min`, or `5min`
- `status`: `pending`, `responded`, or `expired`
- `response`
- `responseMessage`
- `respondedByName`
- `respondedByRole`
- `respondedByDeviceId`
- `visitorAck`
- `visitorAckTime`
- `reminderCount`
- `ringCount`
- `lastRingAt`
- `lastRingBy`
- `residentRingCount`
- `lastResidentRingAt`
- `lastResidentRingByDeviceId`
- `createdAt`
- `expiresAt`

## Lifecycle

- Visitor creates a `pending` arrival.
- Visitor can send up to three reminders and three resident rings while pending.
- Resident with respond permission can move the arrival to `responded`.
- Visitor can acknowledge once; no-response acknowledgement can also mark the arrival `expired`.
- Admin/server cleanup should remove or expire stale arrivals and stale device tokens.
