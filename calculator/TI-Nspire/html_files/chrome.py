import asyncio
from pyppeteer import launch
import os

# Asynchronous function to convert HTML to PDF
async def convert_html_to_pdf(input_path, output_path):
    # Launch a headless browser instance
    browser = await launch(headless=True)  # Headless=True means the browser runs without a GUI
    page = await browser.newPage()  # Open a new page (tab) in the browser

    # Load the HTML content
    if input_path.startswith("http"):  # Check if the input is a URL
        await page.goto(input_path, {"waitUntil": "networkidle2", "timeout": 60000})  # Wait until network activity has stopped
    else:
        # Check if the input file exists
        if not os.path.exists(input_path):
            raise FileNotFoundError(f"Input file not found: {input_path}")  # Raise an error if file is missing
        input_path = f"file://{os.path.abspath(input_path)}"  # Convert the file path to a file:// URL
        await page.goto(input_path, {"waitUntil": "networkidle2"})  # Load the local file

    # Remove <nav> and banner elements from the HTML to clean the output
    await page.evaluate("""
        () => {
            const nav = document.querySelector('nav.navbar.navbar-expand-lg.navbar-light.bg-light');  // Select the navbar
            if (nav) nav.remove();  // Remove the navbar if it exists
            const banner = document.querySelector('#banner, .banner');  // Select elements with ID #banner or class .banner
            if (banner) banner.remove();  // Remove the banner if it exists
        }
    """)

    # Inject JavaScript to modify the counter-reset for numbered lists dynamically
    await page.evaluate("""
        () => {
            const styleTag = document.createElement('style');  // Create a new <style> tag
            styleTag.textContent = `
                .list-group-numbered {
                    counter-reset: list-item 0; /* Reset counter for numbered lists to start from 0 */
                }
            `;
            document.head.appendChild(styleTag);  // Append the <style> tag to the document <head>
        }
    """)

    # Add CSS to prevent breaking inside elements like cards
    await page.addStyleTag({"content": ".card { break-inside: avoid; page-break-inside: avoid; }"})

    # Inject CSS to prevent splitting sections and hide unwanted elements
    await page.addStyleTag({
        "content": """
            .list-group-item-block {
                page-break-inside: avoid; /* Avoid splitting list items across pages */
            }
            nav, #banner {
                display: none !important; /* Hide navigation bar and banners */
            }
        """
    })

    # Inject additional CSS to remove shadows and adjust content for PDF rendering
    await page.addStyleTag({
        "content": """
            
            nav, #banner {
                display: none !important; /* Ensure navigation and banners are hidden */
            }
            .card {
                box-shadow: none; /* Remove shadow effects from card elements */
            }
        """
    })

    

    # Generate the PDF with specific options
    await page.pdf({
        "path": output_path,  # Output file path for the generated PDF
        "format": "A4",  # Standard A4 paper size
        "printBackground": True,  # Include background colors and images
        "preferCSSPageSize": True,  # Use CSS-defined page sizes if available
        "margin": {  # Set all margins to zero
            "top": "0in",
            "bottom": "0in",
            "left": "0in",
            "right": "0in"
        },
        "scale": 0.6,  # Scale down the content to fit better
        "displayHeaderFooter": True,  # Display header and footer (footer includes page numbers)
        "footerTemplate": """
            <div style="font-size:10px; text-align:center; width:100%;">
                Page <span class="pageNumber"></span> of <span class="totalPages"></span>  <!-- Page numbering -->
            </div>
        """,
        "headerTemplate": "<div></div>",  # Empty header
    })

    # Print success message and close the browser
    print(f"PDF successfully saved to {output_path}")
    await browser.close()  # Close the browser instance

# Synchronous wrapper to call the asynchronous function
def convert_to_pdf(input_path, output_path):
    asyncio.get_event_loop().run_until_complete(convert_html_to_pdf(input_path, output_path))  # Run the async function

# Example usage
if __name__ == "__main__":
    base_filename = "eigenvalues"  # Name of the file without extension
    input_html = f"{base_filename}.html"  # Path to the input HTML file
    output_pdf = f"{base_filename}.pdf"   # Path to the output PDF file
    try:
        convert_to_pdf(input_html, output_pdf)  # Call the conversion function
    except Exception as e:
        print(f"An error occurred: {e}")  # Handle and print any errors that occur
