# Real EPUB QA Report - 2026-04-18

## Scope

Local demo build under test:

- App URL: `http://127.0.0.1:4174/`
- Book directory: `/Users/xyf/Downloads/books`
- Date: `2026-04-18`
- Primary artifact: `docs/qa/assets/summary.json`

EPUB samples covered:

- `Introduction_to_Algorithms,_Third_Edition_--_Thomas_H__Cormen,_Charles_E__Leiserson,_Ronald_L__Rivest,_--_2010_--_cj5_--_794e003135cd9871e732ca8b37c6de7d_--_Anna’s_Archive.epub`
- `剑指Offer_名企面试官精讲典型编程题_--_何海涛_--_2011_--_电子工业出版社_--_214aa1542d6778be54e208760805863d_--_Anna’s_Archive.epub`
- `国家为什么会破产_大周期_--_瑞·达利欧_--_2025_--_中信出版集团股份有限公司_--_isbn13_9787521776829_--_63c6372a130fe8ba9f482f25f5da58ec_--_Anna’s_Archive.epub`
- `深入理解TypeScript_--_郭文超_&_等_--_2020_--_chenjin5_com_万千书友聚集地_--_048863942db05e51f9c8c12701b0feea_--_Anna’s_Archive.epub`
- `精通Rust(第2版)_--_[印]拉胡尔•沙玛(Rahul_Sharma)_[芬]韦萨•凯拉维塔(Vesa_Kaihlavirta)_--_2021_--_人民邮电出版社_--_9ffed7de87a634f81fedb829c07c77ab_--_Anna’s_Archive.epub`
- `这书能让你戒烟_--_亚伦•卡尔_--_2014_--_中华工商联合出版社_--_08d353eecc86a3415d777bdc3dd108b4_--_Anna’s_Archive.epub`

User-visible interactions exercised:

- Choose File
- TOC open and section navigation
- Find open, search, click result, clear
- Reader settings: theme, mode, publisher styles, experimental RTL, font family, font size, letter spacing, word spacing
- Paginated mode: page input, `Go`, `Next`/`Previous`, bookmark `Save`, bookmark `Restore`
- Text selection, `Copy`, `Highlight`, `Clear`
- Return from paginated mode to scroll mode
- Image lightbox open on click

Coverage note:

- External-link opening is implemented in the demo, and the sampled EPUBs do contain URL text, but this sweep did not land on a deterministic clickable anchor target in the navigated sections. No external-link bug is claimed from this run.

## Result Summary

- 6 / 6 EPUBs loaded successfully.
- 41 / 42 exercised interactions passed.
- No canvas text truncation or duplicate visible text-run issue was reproduced in this sweep.
- One stable bug was reproduced in `剑指Offer`.

## Bug 1

Title: `Restore` returns to page 1 instead of the saved page in paginated mode for `剑指Offer`

Severity:

- Medium

Affected sample:

- `剑指Offer_名企面试官精讲典型编程题_--_何海涛_--_2011_--_电子工业出版社_--_214aa1542d6778be54e208760805863d_--_Anna’s_Archive.epub`
- Initial backend: `canvas`

Repro steps:

1. Open the `剑指Offer` EPUB.
2. Open `Tune`.
3. Switch `Mode` to `Paginated`.
4. Close the settings drawer.
5. Enter page `3` and click `Go`.
6. Click `Save`.
7. Click `Next` to move to page `4`.
8. Click `Restore`.

Expected:

- Reader returns to page `3`, which is the page that was saved as the bookmark.

Actual:

- Reader status changes to `Bookmark restored`, but the page chip becomes `page 1 of 330`.
- The restore action does not return to the saved page.

Exact captured sequence:

- After mode switch: `paginated`, `canvas / page 1 of 330`
- After `Go`: `paginated`, `canvas / page 3 of 330`
- After `Save`: `paginated`, `canvas / page 3 of 330`
- After `Next`: `paginated`, `canvas / page 4 of 330`
- After `Restore`: `paginated`, `canvas / page 1 of 330`

Evidence:

- Summary entry: `docs/qa/assets/summary.json`
- Failure screenshot: `docs/qa/assets/paginated-navigation-bookmark.png`

Scope:

- This did not reproduce in the other 5 EPUBs from the same directory.
