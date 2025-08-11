document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('contact-form');
    const statusDiv = document.getElementById('form-status');
    const steps = Array.from(document.querySelectorAll('.form-step'));
    const nextBtn = document.getElementById('next-btn');
    const prevBtn = document.getElementById('prev-btn');
    const submitBtn = document.getElementById('submit-btn');
    
    let currentStep = 0;

    function showStep(stepIndex) {
        steps.forEach((step, index) => {
            step.classList.toggle('hidden', index !== stepIndex);
        });

        prevBtn.classList.toggle('hidden', stepIndex === 0);
        nextBtn.classList.toggle('hidden', stepIndex === steps.length - 1);
        submitBtn.classList.toggle('hidden', stepIndex !== steps.length - 1);
    }

    nextBtn.addEventListener('click', () => {
        if (currentStep < steps.length - 1) {
            currentStep++;
            showStep(currentStep);
        }
    });

    prevBtn.addEventListener('click', () => {
        if (currentStep > 0) {
            currentStep--;
            showStep(currentStep);
        }
    });

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Génération en cours...';
        updateStatus('Préparation des fichiers...', 'text-gray-600');

        try {
            const zip = new JSZip();
            
            // 1. Définir la liste des fichiers à inclure
            const fileList = [
                'index.html', 'guide.html', 'contact.html', 'cloud.html',
                'config.json', '_worker.js', '_redirects',
                'admin/index.html', 'admin/login.html', 'admin/js/admin.js',
                'blog/index.html', 'blog/article.html',
                'videos/index.html', 'videos/player.html',
                'js/article.js', 'js/blog.js', 'js/cloud-form.js', 'js/form.js', 'js/home.js', 'js/player.js', 'js/post.js', 'js/utils.js', 'js/videos.js',
                'partials/header.html', 'partials/footer.html',
                'img/author.jpg', 'img/favicon.png', 'img/logo.png'
            ];

            // 2. Créer le nouveau config.json à partir du formulaire
            const formData = new FormData(form);
            const newConfig = {
                siteName: formData.get('siteTitle'),
                siteDescription: formData.get('tagline'),
                author: "Mon Nom", // Placeholder, could be added to form
                substackRssUrl: formData.get('substackRssUrl'),
                youtubeRssUrl: formData.get('youtubeRssUrl'),
                seo: {
                    metaTitle: formData.get('siteTitle'),
                    metaDescription: formData.get('tagline'),
                    metaKeywords: "blog, portfolio, tech"
                }
            };
            zip.file("config.json", JSON.stringify(newConfig, null, 2));

            // 3. Récupérer et ajouter les autres fichiers
            for (let i = 0; i < fileList.length; i++) {
                const filePath = fileList[i];
                if (filePath === 'config.json') continue; // Déjà géré

                updateStatus(`Chargement : ${filePath} (${i + 1}/${fileList.length})`, 'text-gray-600');
                
                const response = await fetch(`/${filePath}`);
                if (!response.ok) {
                    console.warn(`Fichier non trouvé : ${filePath}, il sera ignoré.`);
                    continue;
                }
                const content = await response.blob();
                zip.file(filePath, content);
            }

            // 4. Générer le ZIP et le télécharger
            updateStatus('Compression de l\'archive...', 'text-gray-600');
            const zipContent = await zip.generateAsync({ type: "blob" });

            const link = document.createElement('a');
            link.href = URL.createObjectURL(zipContent);
            link.download = `${slugify(newConfig.siteName || 'stackpages-site')}.zip`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            updateStatus('Site généré avec succès !', 'text-green-600');

        } catch (error) {
            console.error('Erreur lors de la génération du ZIP:', error);
            updateStatus(`Erreur : ${error.message}`, 'text-red-600');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-download mr-2"></i> Générer et Télécharger (.zip)';
        }
    });

    function updateStatus(message, colorClass) {
        statusDiv.innerHTML = message;
        statusDiv.className = `text-center text-sm font-semibold ${colorClass}`;
    }
    
    function slugify(text) {
        return text.toString().toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^\w\-]+/g, '')
            .replace(/\-\-+/g, '-')
            .replace(/^-+/, '')
            .replace(/-+$/, '');
    }

    // Show the first step initially
    showStep(currentStep);
});
