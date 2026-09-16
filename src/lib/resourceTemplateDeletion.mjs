function deletionError(message, status, details = null) {
  return Object.assign(new Error(message), { status, details });
}

export async function deleteResourceTemplateItemSafely({
  db,
  itemRef,
  templateRef,
  item,
  actor,
  deleteExternalResource,
}) {
  const now = new Date();

  if (item.kind === "file") {
    const stage = db.batch();
    stage.update(itemRef, {
      status: "hidden",
      deletionPending: true,
      hiddenAt: now,
      hiddenBy: actor,
      updatedAt: now,
      updatedBy: actor,
    });
    stage.update(templateRef, { updatedAt: now, updatedBy: actor });
    await stage.commit();

    try {
      await deleteExternalResource(item);
    } catch (error) {
      throw deletionError(
        "Resource is hidden from clients, but WorkDrive cleanup failed. Retry deletion.",
        502,
        error?.message || null
      );
    }
  }

  const finalize = db.batch();
  finalize.delete(itemRef);
  finalize.update(templateRef, {
    updatedAt: new Date(),
    updatedBy: actor,
  });
  await finalize.commit();

  return { deletedId: item.id };
}
