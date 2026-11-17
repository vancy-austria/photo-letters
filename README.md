# Photo Letters

Small web app that builds an A3 poster PDF: two text lines plus one big word that is filled with your photos.

Plain HTML, CSS and JavaScript. No build step, no libraries. Works as a static page, for example on GitHub Pages.

## Use

1. Open `index.html` (or the published page).
2. Type the three lines. Line 2 is the one filled with photos.
3. Pick photos with **Fotos wählen**, or drop image files on the page.
4. **Zufall füllen** spreads the photos over the letters. Every photo is used once.
5. Drag a photo from the list onto the letters to place it by hand. Drag it to move, pull the green corner dot or use the slider to resize.
6. Tap a photo in the list to see where it sits in the word. Tap a photo in the word to select it.
7. **PDF laden** writes an A3 PDF with white background.

## Notes

- Page size is A3, landscape by default. **Querformat / Hochformat** switches it.
- PDF quality: 150, 200 or 300 dpi. 300 dpi gives the best print but a bigger file and more work for a phone.
- Fonts come from Google Fonts, so the first load needs internet.
- Photos stay in the browser. Nothing is uploaded.

## Publish on GitHub Pages

Push the folder content to a repo, then in the repo settings turn on Pages for that branch. No build needed.
