package com.evidencepoc.backend.api.representation;

import com.evidencepoc.backend.api.ApiTemplates;
import com.evidencepoc.backend.api.UserRequest;
import com.evidencepoc.backend.domain.description.UserDescription;
import com.evidencepoc.backend.domain.model.User;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonUnwrapped;
import jakarta.ws.rs.core.UriInfo;
import org.springframework.hateoas.Link;
import org.springframework.hateoas.RepresentationModel;
import org.springframework.hateoas.mediatype.Affordances;
import org.springframework.hateoas.server.core.Relation;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;

@Relation(itemRelation = "user", collectionRelation = "users")
public final class UserModel extends RepresentationModel<UserModel> {
  @JsonProperty private final String id;
  @JsonUnwrapped private final UserDescription description;

  public UserModel(User user, UriInfo uriInfo) {
    id = user.getIdentity();
    description = user.getDescription();
    add(
        Affordances.of(Link.of(ApiTemplates.relative(ApiTemplates.user(uriInfo, id))).withSelfRel())
            .afford(HttpMethod.PUT)
            .withInput(UserRequest.class)
            .withInputMediaType(MediaType.APPLICATION_JSON)
            .withName("update")
            .andAfford(HttpMethod.DELETE)
            .withName("delete")
            .toLink());
    add(Link.of(ApiTemplates.relative(ApiTemplates.users(uriInfo)), "users"));
  }
}
