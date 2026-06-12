// File-intake logic extracted from DropZone so the drag-drop path has unit
// coverage (cycle-2: the cycle-1 eval could not simulate OS drag, so this
// wiring shipped uncovered). Pure: no DOM, no Svelte — takes whatever the
// drop event / file picker handed over and returns the text to parse.

/** First file's text + name, or null when the drop/pick carried no file. */
export async function firstFileText(
	files: ArrayLike<File> | null | undefined
): Promise<{ raw: string; name: string } | null> {
	const f = files?.[0];
	if (!f) return null;
	return { raw: await f.text(), name: f.name };
}
