import gsap from "/scripts/greensock/esm/all.js";

// Enregistrer les paramètres du module
Hooks.once('init', () => {
    // Suppression du code d'enregistrement des paramètres de style
});

class CombatTimeline {
    constructor() {
        this.timelineContainer = null;
        this.combatants = new Map();
        this.isVisible = false;
        this.isDragging = false;
        this.dragOffset = { x: 0, y: 0 };
        this.turnNotification = null;
        this.isCombatStarted = false;
    }

    initialize() {
        console.log('Combat Timeline | Initialisation');
        this.createTimelineUI();
        this.registerEventListeners();
        
        // S'assurer que le module est caché au démarrage
        if (this.timelineContainer) {
            this.timelineContainer.classList.add('hidden');
        }
        
        // Vérifier si un combat est déjà en cours et si des initiatives sont lancées
        if (game.combat) {
            const hasInitiative = game.combat.turns.some(combatant => combatant.initiative !== null);
            if (hasInitiative) {
                this.onCombatStart(game.combat);
            }
        }
    }

    createTimelineUI() {
        this.timelineContainer = document.createElement('div');
        this.timelineContainer.id = 'combat-timeline';
        this.timelineContainer.classList.add('hidden');
        
        const template = `
            <div class="timeline-header">
                <div class="header-left">
                    <div class="drag-handle">⋮⋮</div>
                    <span class="round-counter">Round 1</span>
                </div>
                <div class="header-right">
                    <button class="initiative-button npc">Initiative PNJ</button>
                    <button class="initiative-button">Initiative Tous</button>
                </div>
            </div>
            <div class="combatants-container"></div>
            <div class="timeline-footer">
                <div class="previous-controls">
                    <button class="control-button previous-round">◀◀</button>
                    <button class="control-button previous-turn">◀</button>
                </div>
                <div class="control-labels">
                    <span class="control-label">Round / Tour</span>
                    <button class="start-combat-button">Démarrer le combat</button>
                    <button class="control-button end-combat">Terminer le combat</button>
                </div>
                <div class="next-controls">
                    <button class="control-button next-turn">▶</button>
                    <button class="control-button next-round">▶▶</button>
                </div>
            </div>
        `;
        
        this.timelineContainer.innerHTML = template;
        document.body.appendChild(this.timelineContainer);
        
        this.initializeDragAndDrop();
        
        // Ajout des écouteurs d'événements
        const nextTurnBtn = this.timelineContainer.querySelector('.next-turn');
        const prevTurnBtn = this.timelineContainer.querySelector('.previous-turn');
        const nextRoundBtn = this.timelineContainer.querySelector('.next-round');
        const prevRoundBtn = this.timelineContainer.querySelector('.previous-round');
        const endCombatBtn = this.timelineContainer.querySelector('.end-combat');
        
        nextTurnBtn.addEventListener('click', () => this.nextTurn());
        prevTurnBtn.addEventListener('click', () => this.previousTurn());
        nextRoundBtn.addEventListener('click', () => this.nextRound());
        prevRoundBtn.addEventListener('click', () => this.previousRound());
        endCombatBtn.addEventListener('click', () => this.endCombat());
        
        // Ajout des écouteurs pour les nouveaux boutons
        const rollNPCButton = this.timelineContainer.querySelector('.initiative-button.npc');
        const rollAllButton = this.timelineContainer.querySelector('.initiative-button:not(.npc)');
        
        console.log('Combat Timeline | Boutons initiative trouvés:', { 
            rollNPCButton: rollNPCButton ? 'oui' : 'non', 
            rollAllButton: rollAllButton ? 'oui' : 'non' 
        });
        
        rollNPCButton?.addEventListener('click', () => {
            console.log('Combat Timeline | Clic sur bouton Initiative PNJ');
            this.showInitiativeConfirm('PNJ');
        });
        
        rollAllButton?.addEventListener('click', () => {
            console.log('Combat Timeline | Clic sur bouton Initiative TOUS');
            this.showInitiativeConfirm('TOUS');
        });
        
        // Gestion des éléments réservés au GM
        const gmOnlyElements = this.timelineContainer.querySelectorAll('.initiative-button, .end-combat, .control-button, .start-combat-button');
        if (!game.user.isGM) {
            gmOnlyElements.forEach(element => element.remove());
        }
        
        // Ajouter l'écouteur d'événement pour le nouveau bouton
        const startCombatBtn = this.timelineContainer.querySelector('.start-combat-button');
        if (startCombatBtn) {
            startCombatBtn.addEventListener('click', () => this.startCombat());
        }
    }

    initializeDragAndDrop() {
        const dragHandle = this.timelineContainer.querySelector('.drag-handle');
        
        dragHandle.addEventListener('mousedown', (e) => {
            this.isDragging = true;
            const rect = this.timelineContainer.getBoundingClientRect();
            this.dragOffset = {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top
            };
            this.timelineContainer.style.transition = 'none';
        });

        document.addEventListener('mousemove', (e) => {
            if (!this.isDragging) return;
            
            const x = e.clientX - this.dragOffset.x;
            const y = e.clientY - this.dragOffset.y;
            
            this.timelineContainer.style.left = `${x}px`;
            this.timelineContainer.style.top = `${y}px`;
            this.timelineContainer.style.transform = 'none';
        });

        document.addEventListener('mouseup', () => {
            this.isDragging = false;
            this.timelineContainer.style.transition = 'all 0.2s ease';
        });
    }

    registerEventListeners() {
        // Écouter la création d'un combat
        Hooks.on('createCombat', (combat) => {
            console.log('Combat Timeline | Combat créé');
            this.isVisible = true;
            if (this.timelineContainer) {
                this.timelineContainer.classList.remove('hidden');
            }
            this.updateCombatants(combat);
        });
        
        // Écouter les mises à jour du combat
        Hooks.on('updateCombat', (combat, changes, options, userId) => {
            console.log('Combat Timeline | Combat mis à jour', changes);
            if (!combat) return;
            
            // Vérifier si le tour a changé et si le combat est démarré
            if ((changes.turn !== undefined || changes.round !== undefined) && combat.started) {
                const currentCombatant = combat.turns[combat.turn];
                if (currentCombatant) {
                    this.showTurnNotification(currentCombatant);
                }
            }
            
            // Mettre à jour l'interface
            this.updateCombatants(combat);
            
            // Mettre à jour le round
            const roundCounter = this.timelineContainer.querySelector('.round-counter');
            if (roundCounter) {
                roundCounter.textContent = `Round ${combat.round}`;
            }
        });
        
        // Écouter la fin du combat
        Hooks.on('deleteCombat', () => {
            console.log('Combat Timeline | Combat terminé');
            this.isCombatStarted = false;
            this.onCombatEnd();
        });

        // Écouter le début du combat
        Hooks.on('combatStart', (combat) => {
            console.log('Combat Timeline | Combat démarré');
            this.isCombatStarted = true;
            this.onCombatStart(combat);
        });

        // Écouter les changements de tour
        Hooks.on('combatTurn', (combat, update, options) => {
            console.log('Combat Timeline | Nouveau tour');
            if (combat && combat.turns[combat.turn]) {
                this.showTurnNotification(combat.turns[combat.turn]);
            }
        });

        // Écouter les changements d'initiative
        Hooks.on('updateCombatant', (combatant, changes, options, userId) => {
            console.log('Combat Timeline | Mise à jour combattant', changes);
            
            // Si l'initiative vient d'être définie
            if ('initiative' in changes) {
                const combat = game.combat;
                if (combat) {
                    // Vérifier si c'est la première initiative lancée
                    const hasInitiative = combat.turns.some(c => c.initiative !== null);
                    if (hasInitiative && !this.isVisible) {
                        console.log('Combat Timeline | Première initiative lancée, affichage du module');
                        this.onCombatStart(combat);
                    }
                    this.updateCombatants(combat);
                }
            }
            
            // Forcer la mise à jour de l'interface pour tous
            if (game.combat) {
                this.onCombatUpdate(game.combat);
            }
        });

        // Ajouter un hook pour détecter l'ajout de combattants
        Hooks.on('createCombatant', (combatant) => {
            const combat = game.combat;
            if (combat && this.timelineContainer) {
                this.updateCombatants(combat);
            }
        });
    }

    onCombatStart(combat) {
        console.log('Combat Timeline | Démarrage du combat', combat);
        if (!combat) return;
        
        // Ne pas réafficher si déjà visible
        if (!this.isVisible) {
            this.isVisible = true;
            if (this.timelineContainer) {
                this.timelineContainer.classList.remove('hidden');
            }
        }
        
        this.updateCombatants(combat);
    }

    onCombatUpdate(combat) {
        if (!combat || !this.isCombatStarted) return;
        
        console.log('Combat Timeline | Mise à jour complète');
        this.updateCombatants(combat);
        
        // Mise à jour du round
        const roundCounter = this.timelineContainer.querySelector('.round-counter');
        if (roundCounter) {
            roundCounter.textContent = `Round ${combat.round}`;
        }

        // Si le tour a changé, afficher la notification
        if (combat.current?.combatantId) {
            const currentCombatant = combat.turns[combat.turn];
            if (currentCombatant) {
                this.showTurnNotification(currentCombatant);
            }
        }
    }

    onCombatEnd() {
        this.isVisible = false;
        if (this.timelineContainer) {
            this.timelineContainer.classList.add('hidden');
        }
        
        // Réinitialiser le compteur de round
        const roundCounter = this.timelineContainer.querySelector('.round-counter');
        if (roundCounter) {
            roundCounter.textContent = 'Round 1';
        }
    }

    nextTurn() {
        const combat = game.combat;
        if (!combat) return;
        combat.nextTurn();
    }

    previousTurn() {
        const combat = game.combat;
        if (!combat) return;
        combat.previousTurn();
    }

    nextRound() {
        const combat = game.combat;
        if (!combat) return;
        combat.nextRound();
    }

    previousRound() {
        const combat = game.combat;
        if (!combat) return;
        combat.previousRound();
    }

    toggleVisibility() {
        this.isVisible = !this.isVisible;
        if (this.timelineContainer) {
            this.timelineContainer.classList.toggle('hidden', !this.isVisible);
        }
    }

    updateTurnMarker() {
        const combat = game.combat;
        if (!combat || !this.timelineContainer) return;

        const track = this.timelineContainer.querySelector('.timeline-track');
        if (!track) return;

        // Mise à jour du marqueur de tour
        if (!this.currentTurnMarker) {
            this.currentTurnMarker = document.createElement('div');
            this.currentTurnMarker.classList.add('current-turn-marker');
            track.appendChild(this.currentTurnMarker);
        }

        // Calcul de la position
        const totalWidth = track.offsetWidth;
        const combatants = combat.turns.length;
        const position = (combat.turn / Math.max(combatants - 1, 1)) * (totalWidth - 24);
        
        this.currentTurnMarker.style.left = `${position}px`;
        
        // Mise à jour du compteur de rounds
        const roundCounter = this.timelineContainer.querySelector('.round-counter');
        if (roundCounter) {
            roundCounter.textContent = `Round ${combat.round}`;
        }
    }

    updateCombatants(combat) {
        if (!combat) return;

        const container = this.timelineContainer.querySelector('.combatants-container');
        if (!container) return;

        container.innerHTML = '';

        // Si le combat n'est pas encore démarré, utiliser les combattants dans l'ordre d'ajout
        const combatants = combat.started ? combat.turns : combat.combatants;
        
        // Calculer l'initiative maximale pour les barres de progression
        const maxInit = Math.max(...combatants.map(c => c.initiative || 0));
        console.log('Combat Timeline | Initiative maximale:', maxInit);

        // Créer les éléments pour chaque combattant dans l'ordre de Foundry
        combatants.forEach((combatant, index) => {
            if (!combatant || !combatant.token) return;
            
            const row = document.createElement('div');
            row.className = 'combatant-row';
            if (!combatant.initiative) row.classList.add('no-initiative');
            
            // Ajouter la classe active si c'est le tour actuel
            if (combat.current?.combatantId === combatant.id) {
                row.classList.add('active');
            }
            
            // Afficher "?" si l'initiative n'est pas encore lancée
            const initiativeDisplay = combatant.initiative !== null 
                ? combatant.initiative 
                : '?';
            
            // Calculer la largeur de la barre d'initiative
            let barWidth = 0;
            if (combatant.initiative !== null && maxInit > 0) {
                barWidth = (combatant.initiative / maxInit) * 100;
            }
            
            // Ajouter une classe pour les lignes sans initiative
            if (combatant.initiative === null) {
                row.classList.add('no-initiative');
            }
            
            // Vérifier si le combattant est mort directement depuis le combattant
            const isDead = combatant.isDefeated;
            console.log('Combat Timeline | État du combattant:', {
                name: combatant.name,
                isDead: isDead,
                isDefeated: combatant.isDefeated,
                combatant: combatant
            });
            
            row.innerHTML = `
                <div class="combatant-token" style="background-image: url('${combatant.token.texture.src}')">
                    ${isDead ? '<div class="dead-overlay"><i class="fas fa-skull"></i></div>' : ''}
                </div>
                <div class="combatant-info">
                    <div class="combatant-name">${combatant.name}, initiative : ${initiativeDisplay}</div>
                    <div class="initiative-bar ${combatant.initiative === null ? 'hidden' : ''}">
                        <div class="initiative-progress" style="width: ${barWidth}%"></div>
                    </div>
                </div>
                <div class="combatant-actions">
                    ${combatant.initiative === null ? `<button class="roll-initiative" data-combatant-id="${combatant.id}">🎲</button>` : ''}
                </div>
            `;
            
            container.appendChild(row);

            // Ajouter l'écouteur d'événements pour le bouton de lancement d'initiative
            const rollButton = row.querySelector('.roll-initiative');
            if (rollButton) {
                rollButton.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const combatantId = rollButton.dataset.combatantId;
                    const combatant = combat.combatants.get(combatantId);
                    if (combatant) {
                        await game.combat.rollInitiative([combatantId]);
                        this.updateCombatants(game.combat);
                    }
                });
            }
        });
    }

    endCombat() {
        const combat = game.combat;
        if (!combat || !game.user.isGM) return;

        // Créer la popup de confirmation stylisée
        const confirm = document.createElement('div');
        confirm.className = 'initiative-confirm';
        
        confirm.innerHTML = `
            <h3>Terminer le Combat</h3>
            <p>Êtes-vous sûr de vouloir terminer ce combat ?</p>
            <div class="initiative-confirm-buttons">
                <button class="confirm-button confirm">Confirmer</button>
                <button class="confirm-button cancel">Annuler</button>
            </div>
        `;
        
        document.body.appendChild(confirm);
        
        // Animation d'entrée
        setTimeout(() => confirm.classList.add('show'), 10);
        
        // Gérer les boutons
        const confirmBtn = confirm.querySelector('.confirm');
        const cancelBtn = confirm.querySelector('.cancel');
        
        confirmBtn.addEventListener('click', async () => {
            // Utiliser deleteCombat directement au lieu de endCombat pour éviter la confirmation
            await combat.delete();
            closeConfirm();
        });
        
        cancelBtn.addEventListener('click', closeConfirm);
        
        function closeConfirm() {
            confirm.classList.remove('show');
            setTimeout(() => confirm.remove(), 300);
        }
    }

    showTurnNotification(combatant) {
        // Supprimer immédiatement toute notification existante et ses timers
        if (this.turnNotification) {
            clearTimeout(this.hideTimeout);
            clearTimeout(this.removeTimeout);
            this.turnNotification.remove();
        }

        // Créer la nouvelle notification
        this.turnNotification = document.createElement('div');
        this.turnNotification.className = 'turn-notification';
        
        // Ajouter la classe hostile si le token est hostile
        if (combatant.token.disposition === -1) {
            this.turnNotification.classList.add('hostile');
        }
        
        // Vérifier si le combattant est mort directement depuis le combattant
        const isDead = combatant.isDefeated;
        console.log('Combat Timeline | État du combattant (notification):', {
            name: combatant.name,
            isDead: isDead,
            isDefeated: combatant.isDefeated,
            combatant: combatant
        });
        
        const template = `
            <div class="turn-notification-content">
                <div class="turn-token" style="background-image: url('${combatant.token.texture.src}')">
                    ${isDead ? '<div class="dead-overlay"><i class="fas fa-skull"></i></div>' : ''}
                </div>
                <div class="turn-message">
                    <h2>${combatant.name}</h2>
                    <p>C'est à votre tour d'agir !</p>
                </div>
            </div>
        `;
        
        this.turnNotification.innerHTML = template;
        document.body.appendChild(this.turnNotification);

        // Jouer un son de notification
        if (game.settings.get("core", "globalAmbientVolume") > 0) {
            AudioHelper.play({src: "sounds/notify.wav", volume: 0.5, autoplay: true, loop: false}, true);
        }

        // Animation du bandeau (pseudo-élément)
        gsap.fromTo(this.turnNotification,
            {
                opacity: 0,
                scaleY: 0
            },
            {
                opacity: 1,
                scaleY: 1,
                duration: 0.3,
                ease: "power2.out"
            }
        );

        // Animation du contenu
        gsap.fromTo(this.turnNotification.querySelector('.turn-notification-content'),
            {
                opacity: 0,
                x: window.innerWidth
            },
            {
                opacity: 1,
                x: 0,
                duration: 0.5,
                delay: 0.2,
                ease: "power2.out"
            }
        );

        // Animation du token
        gsap.fromTo(this.turnNotification.querySelector('.turn-token'),
            {
                scale: 0,
                rotation: 180
            },
            {
                scale: 1,
                rotation: 0,
                duration: 0.5,
                delay: 0.4,
                ease: "back.out(1.7)"
            }
        );

        // Animation du texte
        gsap.from(this.turnNotification.querySelector('.turn-message h2'), {
            y: -20,
            opacity: 0,
            duration: 0.5,
            delay: 0.5
        });

        gsap.from(this.turnNotification.querySelector('.turn-message p'), {
            y: 20,
            opacity: 0,
            duration: 0.5,
            delay: 0.6
        });

        // Animation de sortie
        this.hideTimeout = setTimeout(() => {
            if (this.turnNotification) {
                // Sortie du contenu
                gsap.to(this.turnNotification.querySelector('.turn-notification-content'), {
                    opacity: 0,
                    x: -window.innerWidth,
                    duration: 0.5,
                    ease: "power2.in"
                });
                
                // Sortie du bandeau
                gsap.to(this.turnNotification, {
                    opacity: 0,
                    scaleY: 0,
                    duration: 0.3,
                    delay: 0.3,
                    ease: "power2.in",
                    onComplete: () => {
                        if (this.turnNotification) {
                            this.turnNotification.remove();
                        }
                    }
                });
            }
        }, 3000);

        // Après avoir affiché la notification du tour actuel, vérifier le prochain combattant
        this.showNextTurnWarning();
    }

    showNextTurnWarning() {
        const combat = game.combat;
        if (!combat || !combat.started) return;

        // Calculer l'index du prochain combattant
        const nextTurn = (combat.turn + 1) % combat.turns.length;
        const nextCombatant = combat.turns[nextTurn];

        // Vérifier si le prochain combattant appartient au joueur actuel
        // Ne pas montrer le message si c'est le MJ
        if (nextCombatant && 
            nextCombatant.actor?.hasPlayerOwner && 
            nextCombatant.actor.isOwner && 
            !nextCombatant.isDefeated && 
            !game.user.isGM) {
            // Créer la notification d'avertissement
            const warning = document.createElement('div');
            warning.className = 'turn-notification next-turn-warning';
            
            warning.innerHTML = `
                <div class="turn-notification-content">
                    <div class="turn-token" style="background-image: url('${nextCombatant.token.texture.src}')"></div>
                    <div class="turn-message">
                        <h2><i class="fas fa-exclamation-triangle"></i> Attention</h2>
                        <p>Votre êtes le suivant</p>
                    </div>
                </div>
            `;
            
            document.body.appendChild(warning);

            // Animation d'entrée
            gsap.fromTo(warning,
                {
                    opacity: 0,
                    y: 50
                },
                {
                    opacity: 1,
                    y: 0,
                    duration: 0.5,
                    ease: "power2.out"
                }
            );

            // Auto-suppression après 3 secondes
            setTimeout(() => {
                gsap.to(warning, {
                    opacity: 0,
                    y: -50,
                    duration: 0.5,
                    ease: "power2.in",
                    onComplete: () => warning.remove()
                });
            }, 3000);
        }
    }

    rollNPCInitiative() {
        console.log('Combat Timeline | Lancement initiative PNJ');
        if (!game.combat) {
            console.log('Combat Timeline | Erreur: Pas de combat actif');
            return;
        }
        
        const npcs = game.combat.combatants.filter(c => !c.actor?.hasPlayerOwner);
        console.log('Combat Timeline | PNJs trouvés:', npcs.map(n => n.name));
        game.combat.rollNPC(npcs);
    }

    rollAllInitiative() {
        console.log('Combat Timeline | Lancement initiative TOUS');
        if (!game.combat) {
            console.log('Combat Timeline | Erreur: Pas de combat actif');
            return;
        }
        
        console.log('Combat Timeline | Lancement rollAll()');
        game.combat.rollAll();
    }

    showInitiativeConfirm(type) {
        console.log('Combat Timeline | Affichage popup confirmation pour:', type);
        
        const confirm = document.createElement('div');
        confirm.className = 'initiative-confirm';
        
        const message = type === 'PNJ' ? 
            'Voulez-vous lancer l\'initiative pour tous les PNJ ?' : 
            'Voulez-vous lancer l\'initiative pour tous les combattants ?';
        
        confirm.innerHTML = `
            <h3>Confirmation</h3>
            <p>${message}</p>
            <div class="initiative-confirm-buttons">
                <button class="confirm-button confirm">Confirmer</button>
                <button class="confirm-button cancel">Annuler</button>
            </div>
        `;
        
        document.body.appendChild(confirm);
        console.log('Combat Timeline | Popup créée');
        
        setTimeout(() => {
            confirm.classList.add('show');
            console.log('Combat Timeline | Popup affichée');
        }, 10);
        
        const confirmBtn = confirm.querySelector('.confirm');
        const cancelBtn = confirm.querySelector('.cancel');
        
        confirmBtn.addEventListener('click', () => {
            console.log('Combat Timeline | Confirmation initiative', type);
            if (type === 'PNJ') {
                this.rollNPCInitiative();
            } else {
                this.rollAllInitiative();
            }
            closeConfirm();
        });
        
        cancelBtn.addEventListener('click', () => {
            console.log('Combat Timeline | Annulation initiative', type);
            closeConfirm();
        });
        
        function closeConfirm() {
            console.log('Combat Timeline | Fermeture popup');
            confirm.classList.remove('show');
            setTimeout(() => {
                confirm.remove();
                console.log('Combat Timeline | Popup supprimée');
            }, 300);
        }
    }

    startCombat() {
        if (!game.user.isGM) return;
        
        const combat = game.combat;
        if (!combat) {
            ui.notifications.warn("Aucun combat n'est actif. Sélectionnez d'abord des tokens.");
            return;
        }
        
        if (combat.started) {
            ui.notifications.warn("Le combat est déjà en cours.");
            return;
        }

        // Vérifier si toutes les initiatives sont lancées
        const hasUnrolledInitiative = combat.combatants.some(c => c.initiative === null);
        if (hasUnrolledInitiative) {
            ui.notifications.warn("Toutes les initiatives doivent être lancées avant de démarrer le combat.");
            return;
        }
        
        combat.startCombat();
    }
}

// Initialisation au chargement de Foundry
Hooks.once('ready', () => {
    console.log('Combat Timeline | Ready Hook');
    window.combatTimeline = new CombatTimeline();
    window.combatTimeline.initialize();
});

// Ajouter un Hook pour détecter les changements de paramètres
Hooks.on('renderSettingsConfig', () => {
    const style = game.settings.get('Scifi-Battle', 'selectedStyle');
    if (window.combatTimeline) {
        window.combatTimeline.setStyle(style);
    }
});
