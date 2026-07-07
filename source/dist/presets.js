export function UpdatePresets(self) {
    const structure = [
        {
            id: 'section1',
            name: 'Section One',
            definitions: [
                {
                    id: 'group1',
                    name: 'Group One',
                    description: 'A starting point for preset definitions!',
                    type: 'simple',
                    presets: ['mylabel'],
                },
            ],
        },
    ];
    const presets = {};
    presets['mylabel'] = {
        type: 'simple',
        name: 'Name',
        style: {
            text: 'My first Preset button',
            size: 'auto',
            color: 0xffffff,
            bgcolor: 0x000000,
            show_topbar: false,
        },
        steps: [],
        feedbacks: [],
    };
    self.setPresetDefinitions(structure, presets);
}
//# sourceMappingURL=presets.js.map