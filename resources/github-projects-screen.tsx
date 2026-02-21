import React from "react";

const WidgetHeader = ({ title, badgeLabel, subtitle }: any) => (
  <Col gap={2}>
    <Row align="center">
      <Title value={title} size="sm" />
    </Row>
    <Row gap={2} align="center">
      <Badge label={badgeLabel} color="discovery" />
      <Text value={subtitle} size="sm" color="secondary" />
    </Row>
  </Col>
);

export const GitHubProjectsScreen = ({ status, repos = [], onSelectRepo }: any) => {
  return (
    <Card size="md">
      <WidgetHeader
        title={status?.text ?? "GitHub Projects"}
        badgeLabel={`${repos.length} repos`}
        subtitle="Tap a repo to open in GitHub"
      />
      <Divider flush />
      <ListView>
        {repos.map((item) => (
          <ListViewItem
            key={item.id}
            gap={3}
            onClickAction={{ type: "repo.open", payload: { url: item.url } }}
          >
            <Box
              background="alpha-10"
              radius="sm"
              padding={2}
              border={{ color: "alpha-20", size: 1 }}
            >
              <Icon name="square-code" size="lg" />
            </Box>
            <Col gap={0}>
              <Text value={item.name} size="sm" weight="semibold" maxLines={1} />
              <Caption
                value={`★ ${item.stars} • ${item.description}`}
                maxLines={1}
              />
            </Col>
            <Spacer />
            <Icon name="external-link" color="secondary" />
          </ListViewItem>
        ))}
      </ListView>
    </Card>
  );
};
