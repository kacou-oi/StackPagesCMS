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
        
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());

        // Combine domain name and TLD
        data.fullDomain = data.domainName + data.domainTld;

        if (!data.email || !data.siteTitle) {
            updateStatus('Veuillez remplir tous les champs requis.', 'text-red-600');
            return;
        }

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Envoi en cours...';

        try {
            const response = await fetch('/api/form', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || 'Une erreur est survenue.');
            }

            updateStatus('Votre demande de déploiement a été envoyée avec succès ! Nous vous contacterons bientôt.', 'text-green-600');
            form.reset();
            currentStep = 0;
            showStep(0);

        } catch (error) {
            console.error('Erreur lors de la soumission du formulaire:', error);
            updateStatus(error.message, 'text-red-600');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-paper-plane mr-2"></i> Lancer le Déploiement';
        }
    });

    function updateStatus(message, colorClass) {
        statusDiv.textContent = message;
        statusDiv.className = `text-center text-sm font-semibold ${colorClass}`;
    }

    // Show the first step initially
    showStep(currentStep);
});
