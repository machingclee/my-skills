---
name: drawio-schema-design
description: >-
  Draw a database schema as a draw.io file, and convert that diagram back into
  Prisma, using this author's convention. Tables and columns stay snake_case
  physical names. A filled diamond is ownership cardinality only. A plain arrow
  is a foreign key. An enum is "column: VALUE | VALUE". Use when creating or
  editing a schema ERD, or when turning a .drawio data model into schema.prisma
  or the reverse. The Prisma conventions were taken from esales-prisma.
---

# draw.io schema design

The picture standard is https://drive.google.com/file/d/1ARx2oOFIIS8csweop2muQG9AaKw0WO1x/view?usp=drive_link (`user`, `comment`, `rel_comment_comment`, `user_rate_limit`). The Prisma standard compared against it is `/Users/chingcheonglee/Repos/hkev/java-modules/web.sales/esales-prisma/prisma/schema.prisma` (MySQL, generator `prisma-client-js`). Those two files are not the same model. Names, enums, keys, and relations below come from the sales schema. The shapes and arrows come from the Drive file.

Copy spelling as stored. Sales names include `aggrement`, `notifiaction_notification`, `notificaiton_redirect_action`, `manufacfuring_year`, `manufacfuring_country`, `orginal_price`, `unregisterd`, `documenent_url`, enum values `GENERATED_PREOVISIONAL_SALES_AGREEMENT`, `SIGNED_PREOVISIONAL_SALES_AGREEMENT`, and `GLOABL`. The Drive file spells `uer_name`. Keep mixed FK spellings as separate columns: `selling_orderId`, `selling_offerId`, `onclick_action_Id`, and the different column `onclick_action_id`.

## Names

A model name is the table name, snake_case. A scalar field name is the column name, snake_case. This schema has no field `@map`.

`@@map` exists only where the model name is not the table name:

| Model | Drawn header / table |
|---|---|
| `aggrement` | `selling_provisional_sales_agreement` |
| `status_agreement_generated` | `selling_status_provisional_sales_agreement_generated` |
| `status_agreement_signed` | `selling_status_provisional_sales_agreement_signed` |
| `status_transaction_confirmed` | `selling_status_transaction_confirmed` |
| `status_transaction_processing` | `selling_status_transaction_processing` |
| `status_transaction_cancelled` | `selling_status_transaction_cancelled` |

Everywhere else the header is the model name (`car_model`, not `CarModel`).

## Tables

Yellow swimlane. Width 140 unless a column name would be clipped.

```
swimlane;fontStyle=0;childLayout=stackLayout;horizontal=1;startSize=30;horizontalStack=0;resizeParent=1;resizeParentMax=0;resizeLast=0;collapsible=1;marginBottom=0;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;
```

Column row. A row named `id` is 20px tall. Every other row is 30px, including the first row of a table that has no `id` (`user_rate_limit.user_email`). Parent height is 30 plus the row heights. Stack `y` from 30.

```
text;align=left;verticalAlign=middle;spacingLeft=4;spacingRight=4;overflow=hidden;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;rotatable=0;whiteSpace=wrap;html=1;fillColor=default;
```

An enum field is one row, field name, then the variants in declaration order, separated by ` | `: `media_type: IMAGES | VIDEO | AUDIO | PDF | TEXT | YOUTUBE_LINK`. The enum's own name is not drawn. `type annotation_type` is drawn `type: CATEGORY | TAG`. A Boolean stays the bare column name (`is_deleted`, `is_published`).

## Aggregate

The diamond is ownership between two table shapes, not between columns. The source is the `1` side. Filled `diamondThin`, no arrowhead on the child, labels `1` and `0..*` or `0..1`. These two files use only those two child multiplicities.

```
edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;exitX=0.75;exitY=0;exitDx=0;exitDy=0;entryX=0.25;entryY=0;entryDx=0;entryDy=0;fillColor=#ffe6cc;strokeColor=#d79b00;startArrow=diamondThin;startFill=1;startSize=12;endArrow=none;endFill=0;
```

Route it above both tables. Label style `edgeLabel;html=1;align=center;verticalAlign=middle;resizable=0;points=[];`, with `1` at `x="-0.84"` and the child multiplicity at `x="0.9"`. A self-aggregate uses the same diamond and routes outside the box (`exitX=0.75;exitY=0`, `entryX=1;entryY=0.25`).

The sales schema has no `onDelete`. The diamond does not become `onDelete: Cascade`, and Cascade does not become a diamond.

Draw a diamond when the child belongs to the parent:

- Parent field is `Child[]` and the child's FK references the parent's `id`: `1` to `0..*`. Sales example: `car_model` owns `car_model_avatar` through `car_model_id`.
- Parent field is `Child?`, the child's FK is required, and it references the parent's `id`: `1` to `0..1`. Uniqueness is either `@unique` on the FK (`ad_media_id` on each ad-media payload and on `car_model_ad_media_image_container`) or `@@unique([fk])` with no field-level `@unique` (`aggrement.selling_order_id`, every `status_*.selling_order_status_id`). Keep whichever form the model already has.

One parent can own several `0..1` extensions at once. Draw one diamond per child. `car_model_ad_media` has optional text, video, audio, pdf, youtube link, and image container. `selling_order_status` has five optional `status_*` tables. The same parent still has its own required FK arrow back to its owner (`car_model_advertisement_id`, `selling_orderId`).

`booking_scheduled_car_assignee` to `booking_assigned_sales`, `booking_assigned_customer`, `booking_car_assignee_registered`, and `booking_car_assignee_unregistered` is `1` to `0..*`. Those FKs are not unique. A relation name that says "extended" does not make the diamond `0..1`.

A self-diamond and a self-link are different pictures.

- Drive `comment` diamonds to itself, `1` to `0..*`, and has no parent-comment column. `rel_comment_comment` carries `parent_comment_id` and `child_comment_id`, plus its own `id`. The link table has arrows and no diamond.
- Sales has no self-diamond. `selling_car` reaches itself through `selling_rel_carsalesoffer_carspecialoffer`, with `@relation("OriginalItem")` and `@relation("SpecialOfferItem")`. Draw two arrows from that join. Draw no diamond on `selling_car`.

Do not diamond a pointer that goes the other way (`car_model.avatar_id` → `car_model_avatar.id`, named `"selected-avatar"`). Do not diamond a join model's FKs (`car_rel_carmodel_annotation`, either `selling_rel_*` model, Drive `user_rate_limit`, Drive `rel_comment_comment`). Those are arrows only.

## Foreign key

One plain arrow per `@relation` that has `fields` and `references`, from the `fields` column to the `references` column. A back-relation with no `fields` is not an arrow (`avatar_for_car_model car_model? @relation("selected-avatar")`). No diamond, no crow's foot, no label on the arrow. The default arrowhead points at the referenced column.

```
edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;exitX=0;exitY=0.5;exitDx=0;exitDy=0;entryX=1;entryY=0.5;entryDx=0;entryDy=0;
```

Exit from the side that faces the target. The arrow's target cell is the `references` column. Every sales `@relation` uses `references: [id]`. The Drive file also targets a non-id column: `user_rate_limit.user_email` → `user.user_email`, while `comment.user_email` → `user.id`. The source column name need not match the target model or the target column (`selling_sales_offer_id` → `selling_car.id`, `timeslot_option_id` → `booking_timeslot_option.id`, `container_id`, `ad_media_id`, `sales_item_id`).

A scalar is an arrow only when it is the `fields` list of a `@relation`. These are columns, and they get no arrow: `user_id`, `created_by_user_id`, `echarge_user_id`, `select_by_user_identifier`, `read_by_user_id`, `used_selected_timeslot_id`, `offer_id` on `selling_rel_offer_handlingfee`, and Drive `article_uuid`. `offer_id` stays a plain `Int` inside `@@unique([offer_id, handlingfee_id])`. The relation column next to it is `selling_offerId Int?`.

In the Drive file, `parent_comment_id` is a column-to-column arrow and the `child_comment_id` edge leaves the `rel_comment_comment` shape and enters `comment.id`. Read that as the remaining `*_id` column on that table. Draw a new FK from the column cell.

A sales ownership diamond is paired with the child's FK arrow. The Drive self-diamond on `comment` has its FK arrows on `rel_comment_comment` instead.

## Prisma to draw.io

1. Header from the Names table. Omit generator, datasource, `///` comments, `@@index`, `@@unique`, `@unique`, `@db`, and `@default`.
2. One row per scalar field, schema order, exact name. Skip a field whose type is a model or a list of a model (`sellingItems`, `car_model`, `sellingOffer`, `avatar_for_car_model`).
3. Enum row as under Tables. Boolean and every other scalar stay the bare name. `String?` and `Int?` are still just the name.
4. One arrow per `@relation(fields, references)`, including an optional one (`selling_offerId`). Follow Foreign key for columns that look like ids and are not relations.
5. Diamond only for the ownership cases under Aggregate, one diamond per child. `avatar_id` is a second arrow and no second diamond. A self-link through a named join is two arrows and no self-diamond.
6. `@relation("selected-avatar")`, `@relation("all-avatars")`, `@relation("OriginalItem")`, and `@relation("SpecialOfferItem")` are not drawn. Keep them in Prisma.

## Draw.io to Prisma

Keep generator (`prisma-client-js`), datasource (`mysql`), `///` comments, field order, `@db`, `@default`, `?`, `@unique`, `@@unique`, `@@id`, and `@@index` that the diagram does not show. Do not add `@@index([id])` to a model that already has none: `car_model_advertisement`, `booking_car_assignee_registered`, `booking_car_assignee_unregistered`, `booking_schedule_link`, `aggrement`, `selling_order_status`, `notification_admin_notification`, `notification_personal_notification`, `notification_onclick_action`, `notificaiton_redirect_action`. Do not recase names. Do not add `@map` on a field.

### Key shapes

Do not turn a `@@unique` join into `@@id`, or the reverse.

| Diagram | Prisma |
|---|---|
| Header `car_model` | `model car_model` with no `@@map` |
| Header that is already mapped | Keep the existing model name and its `@@map` |
| Row `id` on an ordinary new model | `id Int @id @default(autoincrement())` and `@@index([id])` |
| Existing uuid `id` | Keep `String @id @default(uuid()) @db.VarChar(36)` on `file_upload_log`. That model has `started_at` and `completed_at`, and no `created_at` |
| Has `id`, arrows, no diamond | An entity, or a link that owns its own `id`. Drive `rel_comment_comment`. Sales `booking_rel_selectedtimeslot_assignee`. `notification_read_list` also keeps `@@unique([notification_id, read_by_user_id])` |
| No `id`, two FK arrows, no diamond, `car_rel_*` | `@@id([fk, fk])` plus `@@index` on each FK, as `car_rel_carmodel_annotation` |
| No `id`, two FK arrows, no diamond, `selling_rel_*` | `@@unique([fk, fk])` and no `@@id`, as both `selling_rel_*` models |
| No `id`, one arrow | Satellite. Drive `user_rate_limit`: the arrow column is the key and it references `user.user_email`. Do not add `id`. Do not write `@@id` of two columns. No sales model matches this shape |
| `created_at` | `BigInt @default(dbgenerated("(UNIX_TIMESTAMP(UTC_TIMESTAMP(3)) * 1000)"))` |
| `created_at_hk` | `String @default(dbgenerated("(DATE_FORMAT(UTC_TIMESTAMP() + INTERVAL 8 HOUR, '%Y-%m-%d %H:%i:%s'))"))` |
| `updated_at` | Drive only (`user_rate_limit`). Sales has no `updated_at`. Leave it untyped until specified |
| `role: USER \| ADMIN` | MySQL enum, variants in that order |
| Arrow `car_model_id` → `id` | `@relation(fields: [car_model_id], references: [id])`, no `onDelete` |
| Arrow onto a non-id column | `references` is that column (`user.user_email` in the Drive file) |
| Diamond `1` / `0..*` | back-relation `Child[]`, child FK required |
| Diamond `1` / `0..1` | back-relation `Child?`, child FK required and unique, in the form under Aggregate |

A new model also gets `@@index` on each FK column. It writes `id` (when it has one), then scalar rows in diagram order, then relation fields, then `@@` attributes. An existing model keeps its own field order. Relation fields come before the FK scalars in `car_rel_carmodel_annotation`, `booking_assigned_sales`, and `booking_assigned_customer`. `selling_rel_carsalesoffer_carspecialoffer` puts the two FK scalars first. `selling_rel_offer_handlingfee` puts `offer_id` and `handlingfee_id` first, the relation fields next, and `selling_offerId` last.

A new enum uses the field name when that name is already specific (`currency`, `media_type`, `system_level`). Keep an existing enum name when the field name differs:

| Field | Enum |
|---|---|
| `car_model_annotation.type` | `annotation_type` |
| `booking_scheduled_car_assignee.type` | `assignee_type` |
| `selling_sales_item.type` | `sale_item_type` |
| `notifiaction_notification.type` | `notification_type` |
| `notification_onclick_action.type` | `onclick_action_type` |
| `selling_order_status.order_status` | `order_status_type` |
| `file_upload_log.status` | `upload_status` |
| `booking_schedule_link.user_type` | `schedule_user_type` |

Do not create an enum named `type` or `status` for those fields.

The relation field and the back-relation are not rows. Preserve their names and their `@relation("...")` names. camelCase and snake_case both occur (`sellingItems`, `carAvatars`, `relVehicleCategories`, `vbookingSchedules`, `sellingOffer`, `vehicle_stock`, `vehicle`, `car_category`, `vbooking_scheduled_vehicle`). Two relations between the same models need the names already in the schema. The inverse may omit `fields` and `references` when the FK lives on the other model.

A new ordinary column has no type on the diagram. Do not guess `String`, `Int`, `Decimal`, `Float`, `DateTime`, `BigInt`, or `?`. The exceptions are `id`, `created_at`, `created_at_hk`, and an enum row. Copy these from the existing field when the column already exists: `@db.Decimal(19, 4)` (handling-fee `price` also has `@default(0)`), `@db.Text`, `@db.MediumText`, `@db.VarChar(n)`, `token` as `@unique @db.VarChar(64)`, `String @default("")`, `user_id` `@default("Unknown")` on `car_model_ad_media`, `Int @default(0)`, `Int @default(1)`, `Boolean @default(false)`, `Boolean @default(true)`, `BigInt?` on `used_at` / `from_date` / `to_date`, `Float` on `duration_in_hour`, `BigInt` on `version`, and `DateTime? @db.DateTime(3)` on `started_at` / `completed_at`. An arrow does not say whether the FK is optional.

## Skeleton

Page is 850 by 1100, grid 10. Edges are children of the root cell, never of a table.

```xml
<mxCell id="parent" parent="1" value="parent" vertex="1"
  style="swimlane;fontStyle=0;childLayout=stackLayout;horizontal=1;startSize=30;horizontalStack=0;resizeParent=1;resizeParentMax=0;resizeLast=0;collapsible=1;marginBottom=0;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;">
  <mxGeometry x="80" y="220" width="140" height="80" as="geometry"/>
</mxCell>
<mxCell id="parent-id" parent="parent" value="id" vertex="1"
  style="text;align=left;verticalAlign=middle;spacingLeft=4;spacingRight=4;overflow=hidden;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;rotatable=0;whiteSpace=wrap;html=1;fillColor=default;">
  <mxGeometry y="30" width="140" height="20" as="geometry"/>
</mxCell>
<mxCell id="parent-name" parent="parent" value="name" vertex="1"
  style="text;align=left;verticalAlign=middle;spacingLeft=4;spacingRight=4;overflow=hidden;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;rotatable=0;whiteSpace=wrap;html=1;fillColor=default;">
  <mxGeometry y="50" width="140" height="30" as="geometry"/>
</mxCell>
```

Do not switch to `shape=table`, `entityRelationEdgeStyle`, crow's-foot arrows, PascalCase models, or `onDelete: Cascade`.
