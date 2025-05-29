import asyncio
from pyppeteer import launch
import os

# Asynchronous function to convert HTML to PDF
async def convert_html_to_pdf(input_path, output_path):
    browser = await launch(
        headless=True,
        handleSIGINT=False,
        handleSIGTERM=False,
        handleSIGHUP=False
    )
    page = await browser.newPage()

    # Charger le contenu HTML
    if input_path.startswith("http"):
        await page.goto(input_path, {"waitUntil": "networkidle2", "timeout": 60000})
    else:
        if not os.path.exists(input_path):
            raise FileNotFoundError(f"Input file not found: {input_path}")
        input_path = f"file://{os.path.abspath(input_path)}"
        await page.goto(input_path, {"waitUntil": "networkidle2"})

    
    
    # Attendre un délai supplémentaire pour s'assurer que le rendu est terminé
    await page.waitFor(3000)

    # Inject CSS to style each step with the same border color
    await page.evaluate("""
        () => {
            const style = document.createElement('style');
            style.innerHTML = `
                /* Step Container Styling */
                .step-container {
                    padding: 15px;
                    margin-bottom: 10px;
                    border-radius: 10px;
                    border: 3px solid #007BFF;  /* Blue Border */
                    background-color: rgba(0, 123, 255, 0.1); /* Light Blue Background */
                    page-break-inside: avoid;
                }
            `;
            document.head.appendChild(style);
        }
    """)


    # Inject CSS to increase font size
    await page.evaluate("""
        () => {
            const style = document.createElement('style');
            style.innerHTML = `
                body {
                    font-size: 18px !important;
                }
                h1 {
                    font-size: 24px !important;
                }
                h2 {
                    font-size: 22px !important;
                }
                h3 {
                    font-size: 20px !important;
                }
                p, div {
                    font-size: 18px !important;
                }
                .mathjax-block {
                    font-size: 20px !important;
                }
            `;
            document.head.appendChild(style);
        }
    """)
    # Inject the header into the HTML directly in page.evaluate
  
    await page.evaluate("""
        () => {
            document.body.insertAdjacentHTML('afterbegin', `
                <header style="width: 100%; background-color: #00004d; padding: 20px 0; text-align: center; display: flex; align-items: center; justify-content: center; border-radius: 10px;">
                    <div style="flex: 1; text-align: left; padding-left: 20px;">
                        <img src="http://127.0.0.1:8000/static/img/logo.png" alt="Scientia Logo" style="height: 60px;">
                    </div>
                    <div style="flex: 3; color: white; font-size: 26px; font-weight: bold; text-transform: uppercase;">
                        RECIPES FOR THE IB
                    </div>
                </header>
            `);
        }
    """)

   
  # Remove any existing copyright text in the document
    # Force remove any existing copyright text before injecting footerTemplate
    await page.evaluate("""
        () => {
            document.body.querySelectorAll('*').forEach(el => {
                if (el.textContent.trim().includes("© 2024 Scientia-Education") || el.textContent.trim().includes("All rights reserved")) {
                    el.remove();
                }
            });
        }
    """)




    # Supprimer certains éléments mais préserver MathJax
    await page.evaluate("""
        () => {
            
                        
            // Supprimer les éléments nav et banner comme avant
            const nav = document.querySelector('nav.navbar.navbar-expand-lg.navbar-light.bg-light');
            if (nav) nav.remove();
            const banner = document.querySelector('#banner, .banner');
            if (banner) banner.remove();
            
            // Supprimer h1 et h2 tout en préservant leur contenu MathJax
            document.querySelectorAll('h1, h2').forEach(heading => {
                // Si l'en-tête contient des éléments MathJax, les déplacer avant de supprimer l'en-tête
                const parent = heading.parentNode;
                const mathElements = heading.querySelectorAll('.MathJax, .MathJax_Display, [id^="MathJax"]');
                mathElements.forEach(math => parent.insertBefore(math, heading));
                heading.remove();
            });
            
            // Supprimer le bouton "Generate PDF"
            const buttons = document.querySelectorAll('button');
            buttons.forEach(button => {
                if (button.textContent && button.textContent.includes('Generate PDF')) {
                    button.remove();
                }
                else if (button.getAttribute('onclick') && button.getAttribute('onclick').includes('pdf')) {
                    button.remove();
                }
            });
            
            // Chercher également par ID et classe spécifiques
            const pdfButton = document.querySelector('.pdf-button, #generate-pdf');
            if (pdfButton) pdfButton.remove();
                        
            
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
            
        """
    })

    # Inject CSS to add space between steps
    await page.evaluate("""
    () => {
        const style = document.createElement('style');
        style.innerHTML = `
            /* Default Step Container */
            .content-container {
                margin-bottom: 30px;
                padding: 15px;
                border-radius: 10px;
                border: 3px solid #28A745;  /* Green Border */
                background-color: rgba(40, 167, 69, 0.1); /* Light Green Background */
                page-break-inside: avoid;
            }

            /* Special Styling for Step 0 */
            .question-container {
                margin-bottom: 30px;
                padding: 15px;
                border-radius: 10px;
                page-break-inside: avoid;
                border: 3px solid #007BFF;  /* Blue Border */
                background-color: rgba(0, 123, 255, 0.1); /* Light Blue Background */
            }
        `;
        document.head.appendChild(style);
    }
""")


    

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
        "scale": 1,  # Scale down the content to fit better
        "displayHeaderFooter": True,  # Display header and footer (footer includes page numbers)
        "footerTemplate": """
            <div style="
                font-size: 20px; 
                text-align: center; 
                width: 100%;
                padding: 10px 0;
                background-color: #00004d;
                color: black;
                font-family: Arial, sans-serif;
                border-top: 2px solid white;
            ">
                Page <span class="pageNumber"></span> of <span class="totalPages"></span>
                <br>
                © 2024 Scientia-Education | All rights reserved.
            </div>
        """,
        "headerTemplate": "<div></div>",  # Empty header
    })

    # Print success message and close the browser
    print(f"PDF successfully saved to {output_path}")
    await browser.close()  # Close the browser instance

# Synchronous wrapper to call the asynchronous function
def convert_to_pdf(input_path, output_path):
    # Créer une nouvelle boucle d'événements pour ce thread
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        # Exécuter la fonction asynchrone
        loop.run_until_complete(convert_html_to_pdf(input_path, output_path))
    finally:
        # Fermer la boucle d'événements
        loop.close()
# Example usage
if __name__ == "__main__":
    base_filename = "eigenvalues"  # Name of the file without extension
    input_html = f"{base_filename}.html"  # Path to the input HTML file
    output_pdf = f"{base_filename}.pdf"   # Path to the output PDF file
    try:
        convert_to_pdf(input_html, output_pdf)  # Call the conversion function
    except Exception as e:
        print(f"An error occurred: {e}")  # Handle and print any errors that occur