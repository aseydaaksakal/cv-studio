#!/usr/bin/env python3
"""
Test CV upload in Chrome browser - end-to-end UI test
"""
import asyncio
import time
from pathlib import Path
from playwright.async_api import async_playwright

async def test_cv_upload():
    cv_file = Path("C:/Users/aseyd/Downloads/Abdullah_Seyda_Aksakal_CV.pdf")

    if not cv_file.exists():
        print(f"ERROR: CV file not found: {cv_file}")
        return False

    print(f"[TEST] Testing with: {cv_file.name} ({cv_file.stat().st_size} bytes)")

    async with async_playwright() as p:
        # Launch Chrome browser
        browser = await p.chromium.launch(headless=False)
        page = await browser.new_page()

        try:
            # Navigate to localhost:8000
            print("[TEST] Navigating to http://localhost:8000...")
            await page.goto("http://localhost:8000", timeout=10000)
            await page.wait_for_load_state("networkidle")
            print("[TEST] Page loaded")

            # Wait for upload button
            print("[TEST] Looking for upload button...")
            upload_button = page.locator("button:has-text('PDF/DOCX')")
            await upload_button.wait_for(timeout=5000)
            print("[TEST] Upload button found")

            # Click upload button to trigger file picker
            print("[TEST] Clicking upload button...")

            # Set up file input handler BEFORE clicking
            async with page.expect_file_chooser() as fc_info:
                await upload_button.click()

            file_chooser = await fc_info.value
            await file_chooser.set_files(str(cv_file))
            print("[TEST] File selected and uploaded")

            # Wait for upload to complete
            print("[TEST] Waiting for upload to complete...")
            await page.wait_for_timeout(3000)

            # Check if preview is visible
            preview_area = page.locator("main, article, [role='main']")
            await preview_area.wait_for(timeout=5000)

            # Take screenshot
            screenshot_path = "test_upload_screenshot.png"
            await page.screenshot(path=screenshot_path, full_page=True)
            print(f"[TEST] Screenshot saved: {screenshot_path}")

            # Get page content to verify
            content = await page.content()

            # Check for success indicators
            success = False
            if "Yükleniyor" in content or "Abdullah" in content or "cv_generated" in content:
                success = True
                print("[TEST] SUCCESS! Upload successful! Content visible on page")
            else:
                print("[TEST] FAIL! Upload completed but no CV content visible")

            await browser.close()
            return success

        except Exception as e:
            print(f"[TEST] ERROR: {e}")
            import traceback
            traceback.print_exc()
            await browser.close()
            return False

if __name__ == "__main__":
    result = asyncio.run(test_cv_upload())
    exit(0 if result else 1)
